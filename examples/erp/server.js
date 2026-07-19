import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const skuInventory = {
  'SKU-100': { onHand: 420, reserved: 112, warehouse: 'DXB-01' },
  'SKU-220': { onHand: 40, reserved: 10, warehouse: 'RUH-02' },
};

function getArgs(ctx) {
  return ctx?.args || ctx?.input?.args || ctx?.request?.args || {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

app.customer({
  async lookup(ctx) {
    return { id: asString(ctx?.identity?.customer_id, 'erp-operator-1'), role: 'operations' };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: `erp-${ctx.customer.id}`, expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'inventory_balance_get',
    auth: 'required',
    description: 'Return current inventory position for a SKU.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const sku = asString(args.sku);
    const row = skuInventory[sku];
    return {
      found: Boolean(row),
      sku,
      inventory: row || null,
      available: row ? row.onHand - row.reserved : 0,
    };
  },
);

app.tool(
  {
    name: 'purchase_order_create',
    auth: 'required',
    description: 'Create a draft purchase order for replenishment.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const sku = asString(args.sku);
    const quantity = Number(args.quantity || 0);
    if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
      return { accepted: false, error: 'invalid_input' };
    }
    return {
      accepted: true,
      poNumber: `PO-${Math.floor(Date.now() / 1000)}`,
      sku,
      quantity: Math.round(quantity),
      status: 'draft',
    };
  },
);

app.tool(
  {
    name: 'sales_order_eta',
    auth: 'required',
    description: 'Estimate ship readiness for a sales order line item.',
  },
  async (ctx) => {
    const args = getArgs(ctx);
    const sku = asString(args.sku);
    const requested = Number(args.quantity || 0);
    const row = skuInventory[sku];
    const available = row ? row.onHand - row.reserved : 0;
    return {
      sku,
      requested,
      available,
      etaDays: available >= requested ? 1 : 5,
      status: available >= requested ? 'ready' : 'backorder',
    };
  },
);

await app.listen({ port });
console.log('Qefro erp endpoint listening on port', port);
