import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return {
      id: asString(ctx?.identity?.customer_id, asString(ctx?.identity?.phone, 'demo-customer')),
      plan: 'starter',
      locale: asString(ctx?.identity?.locale, 'en'),
    };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: {
        type: 'bearer_token',
        access_token: `starter-${ctx.customer.id}`,
        expires_in: 900,
      },
    };
  },
});

app.tool(
  {
    name: 'customer_profile_get',
    auth: 'required',
    description: 'Return basic customer profile and capabilities for the current session.',
  },
  async (ctx) => {
    return {
      customer: ctx.customer,
      capabilities: ['orders', 'tickets', 'payments'],
      now: new Date().toISOString(),
    };
  },
);

app.tool(
  {
    name: 'session_context_set',
    auth: 'required',
    description: 'Store temporary session context fields that can be echoed back by tooling.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    return {
      updated: true,
      key: asString(args.key, 'topic'),
      value: asString(args.value, 'general'),
      savedAt: Date.now(),
    };
  },
);

await app.listen({ port });
console.log('Qefro basic-sdk endpoint listening on port', port);
