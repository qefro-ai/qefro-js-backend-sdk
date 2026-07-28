import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

/**
 * Auth matrix reference — every auth mode and challenge type in one backend.
 *
 * | Tool                    | auth     | Challenge      |
 * | ----------------------- | -------- | -------------- |
 * | product_info            | none     | —              |
 * | my_recommendations      | optional | — (personalizes if already authorized) |
 * | my_profile              | required | email_otp      |
 * | update_shipping_address | required | sms_otp        |
 * | export_account_data     | required | login          |
 * | approve_refund          | required | custom         |
 *
 * Authorize outcomes shown: success, challenge, denied (wrong code), not_found.
 */

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

/** Dev-only codes. Never hardcode in production. */
const DEV_OTP = process.env.DEV_OTP || '123456';
const DEV_APPROVAL_CODE = process.env.DEV_APPROVAL_CODE || 'APPROVE-42';
const LOGIN_URL = process.env.LOGIN_URL || 'https://example.local/login';

const CUSTOMERS = [
  { id: 'cust-alice', name: 'Alice', email: 'alice@example.com', phone: '+15550001111', tier: 'gold' },
  { id: 'cust-bob', name: 'Bob', email: 'bob@example.com', phone: '+15550002222', tier: 'silver' },
];

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function findCustomer(identity = {}) {
  const email = asString(identity.email).toLowerCase();
  const phone = asString(identity.phone).replace(/[^\d+]/g, '');
  return (
    CUSTOMERS.find(
      (c) =>
        (email && c.email === email) ||
        (phone && c.phone.replace(/[^\d+]/g, '') === phone) ||
        c.id === asString(identity.customer_id),
    ) || null
  );
}

app.customer({
  async lookup(ctx) {
    return findCustomer(ctx.identity);
  },
  /**
   * One authorize handler, dispatched on the tool's default_auth_method.
   * `ctx.response` is empty on the first pass (send a challenge) and holds the
   * user's reply on the resume pass (verify it).
   */
  async authorize(ctx) {
    const customer = ctx.customer;
    if (!customer) {
      return { kind: 'not_found' };
    }

    const method = asString(ctx.method, 'email_otp');

    if (!ctx.response) {
      ctx.logger?.info?.(`[dev] ${method} challenge for ${customer.id}`);
      switch (method) {
        case 'sms_otp':
          return {
            kind: 'challenge',
            challenge: {
              type: 'sms_otp',
              message: `Enter the 6-digit code sent by SMS (dev code: ${DEV_OTP}).`,
              destination_hint: `${customer.phone.slice(0, 3)}•••${customer.phone.slice(-2)}`,
            },
          };
        case 'login':
          return {
            kind: 'challenge',
            challenge: {
              type: 'login',
              message: 'Please sign in, then paste the confirmation code shown after login (dev code: LOGGED-IN).',
              login_url: `${LOGIN_URL}?customer=${customer.id}`,
            },
          };
        case 'approval_code':
          return {
            kind: 'challenge',
            challenge: {
              type: 'custom',
              message: `Open your banking app and enter the approval code shown there (dev code: ${DEV_APPROVAL_CODE}).`,
            },
          };
        default:
          return {
            kind: 'challenge',
            challenge: {
              type: 'email_otp',
              message: `Enter the 6-digit code sent to your email (dev code: ${DEV_OTP}).`,
              destination_hint: `${customer.email[0]}***@${customer.email.split('@')[1]}`,
            },
          };
      }
    }

    const reply = asString(ctx.response);
    const accepted =
      method === 'login'
        ? reply.toUpperCase() === 'LOGGED-IN'
        : method === 'approval_code'
          ? reply.toUpperCase() === DEV_APPROVAL_CODE
          : reply === DEV_OTP;

    if (!accepted) {
      // Wrong code ends the attempt (`denied`). Re-challenge instead if you
      // want to allow retries — see the order-status example.
      return { kind: 'denied' };
    }

    return {
      kind: 'success',
      customer,
      auth: {
        type: 'bearer_token',
        access_token: `matrix-${customer.id}-${method}`,
        expires_in: 900,
        customer_id: customer.id,
      },
    };
  },
});

// auth: none — public, never asks for anything.
app.tool(
  {
    name: 'product_info',
    description: 'Public product catalog lookup. No authentication.',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: { sku: { type: 'string', description: 'SKU such as SKU-1' } },
      required: ['sku'],
    },
  },
  async (ctx) => {
    const sku = asString(ctx.parameters?.sku, 'SKU-1').toUpperCase();
    return { sku, name: `Demo product ${sku}`, price: 19.99, currency: 'USD', in_stock: true };
  },
);

// auth: optional — works anonymously; personalizes when the conversation is
// already authorized (e.g. after my_profile ran and cached the session).
app.tool(
  {
    name: 'my_recommendations',
    description: 'Product recommendations. Generic for guests, personalized once the customer is verified.',
    auth: 'optional',
  },
  async (ctx) => {
    const authorized = ctx.customer.get();
    if (!authorized) {
      return {
        personalized: false,
        recommendations: ['SKU-1', 'SKU-2'],
        message: 'Popular right now. Verify your account for personal picks.',
      };
    }
    return {
      personalized: true,
      customer_id: authorized.id,
      recommendations: authorized.tier === 'gold' ? ['SKU-9', 'SKU-7'] : ['SKU-3', 'SKU-4'],
      message: `Picks for ${authorized.name} (${authorized.tier} tier).`,
    };
  },
);

// auth: required + email_otp.
app.tool(
  {
    name: 'my_profile',
    description: 'Show the verified customer profile.',
    auth: 'required',
    authentication_methods: ['email_otp'],
    default_auth_method: 'email_otp',
    lookup: { required: ['email'] },
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    return { id: customer.id, name: customer.name, email: customer.email, tier: customer.tier };
  },
);

// auth: required + sms_otp, identity resolved by phone.
app.tool(
  {
    name: 'update_shipping_address',
    description: 'Update the default shipping address (SMS verification).',
    auth: 'required',
    authentication_methods: ['sms_otp'],
    default_auth_method: 'sms_otp',
    lookup: { required: ['phone'] },
    input_schema: {
      type: 'object',
      properties: { address: { type: 'string', description: 'New shipping address' } },
      required: ['address'],
    },
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    const address = asString(ctx.parameters?.address);
    return {
      updated: address.length >= 10,
      customer_id: customer.id,
      address: address.length >= 10 ? address : null,
      error: address.length >= 10 ? null : 'address_too_short',
    };
  },
);

// auth: required + login challenge (redirect to your own login page).
app.tool(
  {
    name: 'export_account_data',
    description: 'Request a GDPR data export. Requires a fresh login.',
    auth: 'required',
    authentication_methods: ['login'],
    default_auth_method: 'login',
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    return {
      requested: true,
      customer_id: customer.id,
      delivery: customer.email,
      eta_hours: 24,
      message: `Export queued. A download link will be emailed to ${customer.email}.`,
    };
  },
);

// auth: required + custom challenge (out-of-band approval, e.g. in-app code).
app.tool(
  {
    name: 'approve_refund',
    description: 'Approve a high-value refund. Requires an in-app approval code.',
    auth: 'required',
    authentication_methods: ['approval_code'],
    default_auth_method: 'approval_code',
    input_schema: {
      type: 'object',
      properties: {
        refund_id: { type: 'string', description: 'Refund reference such as RF-1001' },
      },
      required: ['refund_id'],
    },
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    const refundId = asString(ctx.parameters?.refund_id, 'RF-1001').toUpperCase();
    return { approved: true, refund_id: refundId, approved_by: customer.id };
  },
);

const handle = await app.listen({ port });
console.log('Auth matrix example listening');
console.log(`  Webhook URL   : ${handle.url}`);
console.log(`  Dev OTP       : ${DEV_OTP}`);
console.log(`  Approval code : ${DEV_APPROVAL_CODE}  (login resume: LOGGED-IN)`);
console.log('  Customers     : alice@example.com / +15550001111, bob@example.com / +15550002222');
