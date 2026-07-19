import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const orders = [
  { id: 'ord-1001', customerId: 'demo-customer', status: 'shipped', amount: 129.5 },
  { id: 'ord-1002', customerId: 'demo-customer', status: 'processing', amount: 49.0 },
];

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'demo-customer') };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `rest-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'orders_list',
    auth: 'required',
    description: 'List orders for the authenticated customer. Mirrors a REST GET /orders contract.',
  },
  async (ctx) => {
    return { data: orders.filter((o) => o.customerId === ctx.customer.id), count: orders.length };
  },
);

app.tool(
  {
    name: 'orders_get',
    auth: 'required',
    description: 'Return one order by ID. Mirrors a REST GET /orders/{id} contract.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const id = asString(args.order_id || args.id);
    const order = orders.find((o) => o.id === id && o.customerId === ctx.customer.id);
    return {
      found: Boolean(order),
      order: order || null,
      error: order ? null : 'order_not_found',
    };
  },
);

await app.listen({ port });
console.log('Qefro rest-api endpoint listening on port', port);
