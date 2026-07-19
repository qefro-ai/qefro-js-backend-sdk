import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const orders = {
  'ord-9001': { id: 'ord-9001', status: 'in_transit', etaDays: 2, total: 219.0 },
  'ord-9002': { id: 'ord-9002', status: 'delivered', etaDays: 0, total: 89.99 },
};

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asReason(value) {
  const normalized = asString(value, 'other').toLowerCase();
  const allowed = ['size', 'damage', 'wrong_item', 'late_delivery', 'other'];
  return allowed.includes(normalized) ? normalized : 'other';
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'shopper-001'), tier: 'gold' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `ecom-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'order_track',
    auth: 'required',
    description: 'Track an order by ID and return status plus ETA.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const orderId = asString(args.order_id);
    const order = orders[orderId];
    return {
      found: Boolean(order),
      order: order || null,
      message: order ? `Order ${orderId} is ${order.status}.` : 'Order not found.',
    };
  },
);

app.tool(
  {
    name: 'return_create',
    auth: 'required',
    description: 'Create a return request with strict reason validation.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const orderId = asString(args.order_id);
    const reason = asReason(args.reason);
    const hasOrder = Boolean(orders[orderId]);
    return {
      accepted: hasOrder,
      returnId: hasOrder ? `ret-${Date.now()}` : null,
      reason,
      orderId,
      error: hasOrder ? null : 'invalid_order_id',
    };
  },
);

app.tool(
  {
    name: 'invoice_download_link',
    auth: 'required',
    description: 'Generate a short-lived invoice URL for an order.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const orderId = asString(args.order_id);
    return {
      orderId,
      expiresInSeconds: 300,
      url: `https://example.local/invoices/${encodeURIComponent(orderId)}?token=${ctx.customer.id}`,
    };
  },
);

await app.listen({ port });
console.log('Qefro ecommerce endpoint listening on port', port);
