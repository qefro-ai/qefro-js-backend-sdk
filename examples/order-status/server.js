import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8090);
const signingSecret = process.env.QEFRO_SIGNING_SECRET || 'dev-secret-order-status';

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

function normalizeOrderId(raw) {
  return asString(raw).toUpperCase().replace(/\s+/g, '');
}

function resolveCustomerId(identity = {}) {
  return asString(
    identity.customer_id,
    asString(identity.user_id, asString(identity.phone, 'cust-alice')),
  );
}

const app = new Qefro({
  signingSecret,
  endpointPath: '/qefro',
});

app.customer({
  async lookup(ctx) {
    const id = resolveCustomerId(ctx.identity);
    return {
      id,
      name: id.startsWith('+') ? `Phone ${id}` : id,
      email: `${id.replace(/[^a-z0-9]/gi, '')}@example.com`,
    };
  },
  async authorize(ctx) {
    // Dev mock: always succeed so Test Tool / chat can exercise order lookups quickly.
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: {
        type: 'bearer_token',
        access_token: `mock-${ctx.customer.id}`,
        expires_in: 900,
        customer_id: String(ctx.customer.id),
      },
    };
  },
});

app.tool(
  {
    name: 'order_status_check',
    description:
      'Look up the status of an order by order ID. Returns status, ETA, tracking, and line items.',
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
    description: 'List recent orders for the current customer (uses channel identity).',
    auth: 'required',
    input_schema: {
      type: 'object',
      properties: {
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
      count: orders.length,
      orders,
      message:
        orders.length > 0
          ? `Found ${orders.length} order(s) for ${customer.id}.`
          : `No orders for ${customer.id}. Try identity customer_id cust-alice.`,
    };
  },
);

const handle = await app.listen({ port, path: '/qefro' });

console.log('');
console.log('Mock order-status SDK listening');
console.log(`  Webhook URL : ${handle.url}`);
console.log(`  Signing secret: ${signingSecret}`);
console.log('');
console.log('Sample order IDs for order_status_check:');
for (const order of Object.values(ORDERS)) {
  console.log(`  ${order.id}  ${order.status.padEnd(12)}  ${order.customerId}`);
}
console.log('');
console.log('Admin Console setup:');
console.log('  1. Business Tools → SDK Connections → Add Connection');
console.log(`  2. Webhook URL = ${handle.url}`);
console.log('  3. Paste the signing secret above (or set QEFRO_SIGNING_SECRET to match)');
console.log('  4. Test Connection, then Sync Tools into a workspace');
console.log('');
