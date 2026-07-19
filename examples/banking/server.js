import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const accounts = {
  'acct-01': { currency: 'USD', available: 3250.1, hold: 120.0 },
  'acct-02': { currency: 'EUR', available: 812.4, hold: 0 },
};

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'retail-banking-1'), segment: 'retail' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `bank-${ctx.customer.id}`, expires_in: 600 },
    };
  },
});

app.tool(
  {
    name: 'account_balance_get',
    auth: 'required',
    description: 'Fetch account balance and available funds.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const accountId = asString(args.account_id, 'acct-01');
    const account = accounts[accountId];
    return {
      found: Boolean(account),
      accountId,
      account: account || null,
      error: account ? null : 'account_not_found',
    };
  },
);

app.tool(
  {
    name: 'beneficiary_validate',
    auth: 'required',
    description: 'Validate beneficiary account details before transfer initiation.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const iban = asString(args.iban).replace(/\s+/g, '');
    const valid = /^[A-Z0-9]{15,34}$/.test(iban);
    return {
      valid,
      ibanMasked: valid ? `${iban.slice(0, 4)}****${iban.slice(-4)}` : null,
      reason: valid ? null : 'invalid_iban_format',
    };
  },
);

await app.listen({ port });
console.log('Qefro banking endpoint listening on port', port);
