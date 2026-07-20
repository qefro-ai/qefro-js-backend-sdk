import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8090);
const signingSecret = process.env.QEFRO_SIGNING_SECRET || 'dev-secret-order-status';
/** Hardcoded OTP for pause/resume testing. Never use in production. */
const DEV_OTP = process.env.DEV_OTP || '123456';
/**
 * Identity attribute this tool requires the Qefro runtime to resolve.
 * `email` — Portal/admin auto; Widget/WhatsApp ask when missing.
 * `phone` — WhatsApp auto; Portal/Widget ask when missing.
 */
const LOOKUP_BY = (process.env.LOOKUP_BY || 'email').trim().toLowerCase() === 'phone'
  ? 'phone'
  : 'email';

/**
 * @typedef {{ id: string, name: string, email: string, emails?: string[], phone: string }} Customer
 */

/** @type {Customer[]} */
const CUSTOMERS = [
  {
    id: 'cust-alice',
    name: 'Alice',
    // Primary + aliases so Widget (typed email) matches Portal login email.
    email: 'alice@example.com',
    emails: ['alice@example.com', 'info@cyberfly.io'],
    phone: '+15550001111',
  },
  {
    id: 'cust-bob',
    name: 'Bob',
    email: 'bob@example.com',
    phone: '+15550002222',
  },
  {
    id: 'cust-carol',
    name: 'Carol',
    email: 'carol@example.com',
    phone: '+15550003333',
  },
];

function customerEmails(c) {
  const list = [c.email, ...(c.emails || [])].map(normalizeEmail).filter(Boolean);
  return [...new Set(list)];
}
/** @type {Record<string, {
 *   id: string
 *   customerId: string
 *   status: string
 *   items: string[]
 *   total: number
 *   currency: string
 *   shippedAt: string | null
 *   eta: string | null
 *   trackingNumber: string | null
 *   carrier: string | null
 * }>} */
const ORDERS = {
  'ORD-1001': {
    id: 'ORD-1001',
    customerId: 'cust-alice',
    status: 'processing',
    items: ['Wireless Mouse', 'USB-C Hub'],
    total: 79.98,
    currency: 'USD',
    shippedAt: null,
    eta: '2026-07-25',
    trackingNumber: null,
    carrier: null,
  },
  'ORD-1002': {
    id: 'ORD-1002',
    customerId: 'cust-alice',
    status: 'shipped',
    items: ['Standing Desk Mat'],
    total: 49.0,
    currency: 'USD',
    shippedAt: '2026-07-18',
    eta: '2026-07-22',
    trackingNumber: '1Z999AA10123456784',
    carrier: 'UPS',
  },
  'ORD-2001': {
    id: 'ORD-2001',
    customerId: 'cust-bob',
    status: 'delivered',
    items: ['Laptop Sleeve', 'HDMI Cable'],
    total: 44.5,
    currency: 'USD',
    shippedAt: '2026-07-10',
    eta: '2026-07-14',
    trackingNumber: '9400111899223344556677',
    carrier: 'USPS',
  },
  'ORD-3001': {
    id: 'ORD-3001',
    customerId: 'cust-carol',
    status: 'cancelled',
    items: ['Ergonomic Chair'],
    total: 299.0,
    currency: 'USD',
    shippedAt: null,
    eta: null,
    trackingNumber: null,
    carrier: null,
  },
};

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeEmail(raw) {
  return asString(raw).toLowerCase();
}

function normalizePhone(raw) {
  const s = asString(raw).replace(/[^\d+]/g, '');
  return s;
}

function normalizeOrderId(raw) {
  return asString(raw).toUpperCase().replace(/\s+/g, '');
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***@example.com';
  const head = local.slice(0, 1) || '*';
  return `${head}***@${domain}`;
}

function maskPhone(phone) {
  const p = String(phone);
  if (p.length < 4) return '***';
  return `${p.slice(0, 2)}***${p.slice(-2)}`;
}

function readIdentityField(identity = {}, key) {
  return asString(identity[key], asString(identity[`${key}`]));
}

/**
 * Org customer directory lookup — Qefro only supplies resolved identity attributes.
 * @returns {Customer | null}
 */
function findCustomer({ email, phone }) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);

  if (LOOKUP_BY === 'email' && e) {
    const hit = CUSTOMERS.find((c) => customerEmails(c).includes(e));
    if (hit) {
      // Prefer the email the caller used (e.g. info@cyberfly.io on Widget).
      return { ...hit, email: e };
    }
    return null;
  }

  if (LOOKUP_BY === 'phone' && p) {
    return CUSTOMERS.find((c) => normalizePhone(c.phone) === p) || null;
  }

  return null;
}

const app = new Qefro({
  signingSecret,
  endpointPath: '/qefro',
});

app.customer({
  async lookup(ctx) {
    const identity = ctx.identity || {};
    const parameters = ctx.parameters || {};
    const email = normalizeEmail(
      readIdentityField(identity, 'email') || asString(parameters.email),
    );
    const phone = normalizePhone(
      readIdentityField(identity, 'phone') || asString(parameters.phone),
    );
    return findCustomer({ email, phone });
  },
  async authorize(ctx) {
    const customer = ctx.customer;
    if (!customer) {
      return {
        kind: 'not_found',
        message:
          LOOKUP_BY === 'email'
            ? `No account for that email. Try: ${CUSTOMERS.map((c) => customerEmails(c).join(' or ')).join(', ')}.`
            : `No account for that phone. Try: ${CUSTOMERS.map((c) => c.phone).join(', ')}.`,
      };
    }

    if (!ctx.response) {
      ctx.logger?.info?.(
        `[dev] OTP for ${customer.id} via ${LOOKUP_BY} — code ${DEV_OTP}`,
      );
      if (LOOKUP_BY === 'phone') {
        return {
          kind: 'challenge',
          challenge: {
            type: 'sms_otp',
            message: `Enter the 6-digit OTP sent by SMS (dev code: ${DEV_OTP}).`,
            destination_hint: maskPhone(customer.phone),
          },
        };
      }
      return {
        kind: 'challenge',
        challenge: {
          type: 'email_otp',
          message: `Enter the 6-digit OTP sent to your email (dev code: ${DEV_OTP}).`,
          destination_hint: maskEmail(customer.email),
        },
      };
    }

    if (String(ctx.response).trim() !== DEV_OTP) {
      return { kind: 'denied' };
    }

    return {
      kind: 'success',
      customer,
      auth: {
        type: 'bearer_token',
        access_token: `mock-${customer.id}`,
        expires_in: 900,
        customer_id: String(customer.id),
      },
    };
  },
});

app.tool(
  {
    name: 'order_status_check',
    description:
      'Look up one order by order ID (e.g. ORD-1001). Use only when the customer already provided an order ID. For “my orders” / order list without an ID, use my_orders_list instead.',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Order ID such as ORD-1001',
        },
      },
      required: ['order_id'],
    },
  },
  async (ctx) => {
    const orderId = normalizeOrderId(ctx.parameters?.order_id);
    if (!orderId) {
      return {
        found: false,
        error: 'missing_order_id',
        message: 'Please provide an order_id (for example ORD-1001).',
        sample_ids: Object.keys(ORDERS),
      };
    }

    const order = ORDERS[orderId];
    if (!order) {
      return {
        found: false,
        order_id: orderId,
        error: 'not_found',
        message: `No order found for ${orderId}.`,
        sample_ids: Object.keys(ORDERS),
      };
    }

    return {
      found: true,
      order_id: order.id,
      status: order.status,
      items: order.items,
      total: order.total,
      currency: order.currency,
      shipped_at: order.shippedAt,
      eta: order.eta,
      tracking_number: order.trackingNumber,
      carrier: order.carrier,
      message: order.trackingNumber
        ? `Order ${order.id} is ${order.status} via ${order.carrier} (${order.trackingNumber}).`
        : `Order ${order.id} is ${order.status}.`,
    };
  },
);

app.tool(
  {
    name: 'my_orders_list',
    description:
      LOOKUP_BY === 'phone'
        ? 'List the current customer’s recent orders. Runtime resolves phone from WhatsApp or asks for it, then sends SMS OTP.'
        : 'List the current customer’s recent orders. Runtime resolves email from Portal/admin or asks for it on Widget, then sends email OTP.',
    auth: 'required',
    authentication_methods: [LOOKUP_BY === 'phone' ? 'sms_otp' : 'email_otp'],
    default_auth_method: LOOKUP_BY === 'phone' ? 'sms_otp' : 'email_otp',
    // Qefro runtime resolves these before invoke (channel identity → conversation → ask user).
    lookup: { required: [LOOKUP_BY] },
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Account email when the channel did not already provide one',
        },
        phone: {
          type: 'string',
          description: 'Account phone (E.164) when the channel did not already provide one',
        },
        limit: {
          type: 'integer',
          description: 'Max orders to return (default 5)',
          minimum: 1,
          maximum: 20,
        },
      },
    },
  },
  async (ctx) => {
    const customer = ctx.customer.require();
    const limit = Math.min(
      20,
      Math.max(1, Number(ctx.parameters?.limit) || 5),
    );
    const orders = Object.values(ORDERS)
      .filter((o) => o.customerId === customer.id)
      .slice(0, limit)
      .map((o) => ({
        order_id: o.id,
        status: o.status,
        total: o.total,
        currency: o.currency,
        eta: o.eta,
      }));

    return {
      customer_id: customer.id,
      email: customer.email,
      phone: customer.phone,
      count: orders.length,
      orders,
      message:
        orders.length > 0
          ? `Found ${orders.length} order(s) for ${customer.name}.`
          : `No orders for ${customer.id}.`,
    };
  },
);

const handle = await app.listen({ port, path: '/qefro' });

console.log('');
console.log('Mock order-status SDK listening');
console.log(`  Webhook URL : ${handle.url}`);
console.log(`  Signing secret: ${signingSecret}`);
console.log(`  lookup.required: [${LOOKUP_BY}]  (set LOOKUP_BY=phone|email)`);
console.log(`  Dev OTP: ${DEV_OTP}`);
console.log('');
console.log('Customers:');
for (const c of CUSTOMERS) {
  console.log(
    `  ${c.id.padEnd(12)}  ${customerEmails(c).join(', ').padEnd(40)}  ${c.phone}`,
  );
}
console.log('');
console.log('Sample order IDs:');
for (const order of Object.values(ORDERS)) {
  console.log(`  ${order.id}  ${order.status.padEnd(12)}  ${order.customerId}`);
}
console.log('');
console.log('Identity resolution (runtime, not this SDK):');
console.log('  Portal + email lookup → uses admin login email if it exists in directory');
console.log('  WhatsApp + phone lookup → uses WhatsApp phone automatically');
console.log('  Widget → asks user for missing email/phone, then invokes');
console.log('  Directory emails: info@cyberfly.io | alice@example.com | bob@… | carol@…');
console.log('');
