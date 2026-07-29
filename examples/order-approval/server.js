import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8091);
const signingSecret = process.env.QEFRO_SIGNING_SECRET || 'dev-secret';

// Demo OTP for exercising the challenge step end-to-end (never sent anywhere).
const DUMMY_OTP = process.env.DEMO_OTP || '123456';

const ORDERS = {
  'ORD-1001': {
    id: 'ORD-1001',
    status: 'processing',
    items: ['Wireless Mouse', 'USB-C Hub'],
    total: 79.98,
    currency: 'USD',
    eta: '2026-08-05',
  },
  'ORD-1002': {
    id: 'ORD-1002',
    status: 'shipped',
    items: ['Standing Desk Mat'],
    total: 49.0,
    currency: 'USD',
    eta: '2026-08-01',
  },
  'ORD-1003': {
    id: 'ORD-1003',
    status: 'delivered',
    items: ['Laptop Sleeve'],
    total: 24.5,
    currency: 'USD',
    eta: null,
  },
};

function normalizeOrderId(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

const app = new Qefro({ signingSecret, endpointPath: '/qefro' });

// Customer provider: the flow's authenticated cancel step triggers this OTP
// challenge automatically — the Runtime pauses the flow run, relays the
// prompt to the customer, and resumes the tool call with their answer.
app.customer({
  async lookup(ctx) {
    const id = String(
      ctx.identity.customer_id || ctx.identity.user_id || ctx.identity.phone || 'cust-demo',
    );
    return { id, name: `Customer ${id}` };
  },
  async authorize(ctx) {
    if (!ctx.response) {
      return {
        kind: 'challenge',
        challenge: {
          type: 'sms_otp',
          message: `To verify it's you, please enter the one-time code we sent to your phone. (Demo: the code is ${DUMMY_OTP}.)`,
        },
      };
    }
    if (ctx.response.trim() !== DUMMY_OTP) {
      return {
        kind: 'challenge',
        challenge: {
          type: 'sms_otp',
          message: `That code is incorrect. Please try again. (Demo: the code is ${DUMMY_OTP}.)`,
        },
      };
    }
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: {
        type: 'bearer_token',
        access_token: `demo-${ctx.customer.id}`,
        expires_in: 900,
        customer_id: String(ctx.customer.id),
      },
    };
  },
});

app.tool(
  {
    name: 'order_status_check',
    description: 'Look up the status of an order by order ID.',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID such as ORD-1001' },
      },
      required: ['order_id'],
    },
  },
  async (ctx) => {
    const orderId = normalizeOrderId(ctx.parameters?.order_id);
    const order = ORDERS[orderId];
    if (!order) {
      return {
        found: false,
        order_id: orderId,
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
      eta: order.eta,
      message: `Order ${order.id} is ${order.status}.`,
    };
  },
);

app.tool(
  {
    name: 'order_cancel',
    description: 'Cancel an order by order ID. Requires customer verification.',
    auth: 'required',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID to cancel' },
      },
      required: ['order_id'],
    },
  },
  async (ctx) => {
    ctx.customer.require();
    const orderId = normalizeOrderId(ctx.parameters?.order_id);
    const order = ORDERS[orderId];
    if (!order) {
      return { cancelled: false, order_id: orderId, message: `No order found for ${orderId}.` };
    }
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return {
        cancelled: false,
        order_id: order.id,
        message: `Order ${order.id} is ${order.status} and can no longer be cancelled.`,
      };
    }
    order.status = 'cancelled';
    order.eta = null;
    return {
      cancelled: true,
      order_id: order.id,
      message: `Order ${order.id} has been cancelled. Any payment will be refunded in 3-5 business days.`,
    };
  },
);

// ---------------------------------------------------------------------------
// Business Flows. Still metadata only from the SDK's point of view — the
// Qefro Runtime executes the steps, calling the tools above over the same
// signed webhook when a `tool` step runs.
// ---------------------------------------------------------------------------

app
  .flow({
    id: 'track-order',
    name: 'Track an order',
    description: 'Collect an order ID, look it up, and report its status.',
    version: 1,
    category: 'orders',
    tags: ['orders', 'tracking'],
    intent: [
      'track my order',
      'where is my order',
      'what is the status of my order',
    ],
    outputs: ['order_status_check'],
  })
  .ask({
    id: 'collect_order_id',
    field: 'order_id',
    prompt: 'Which order would you like to track? Please share your order ID (for example ORD-1001).',
  })
  .tool({ id: 'lookup_order', tool_ref: 'order_status_check' })
  .condition({
    id: 'check_found',
    when: 'order_status_check.found == true',
    then: 'report_status',
    else: 'report_missing',
  })
  .complete({
    id: 'report_missing',
    message: "I couldn't find an order with ID {{order_id}}. Please double-check the ID and try again.",
  })
  .complete({
    id: 'report_status',
    message: 'Order {{order_id}} is currently {{order_status_check.status}}. {{order_status_check.message}}',
  });

// cancel-order exercises the full runtime feature set:
//   ask -> tool -> condition -> approval (human) -> tool with auth (OTP) -> complete
app
  .flow({
    id: 'cancel-order',
    name: 'Cancel an order',
    description:
      'Collect an order ID, verify it exists, get supervisor approval, verify the customer, then cancel the order.',
    version: 1,
    category: 'orders',
    tags: ['orders', 'cancellation'],
    intent: [
      'cancel my order',
      'i want to cancel an order',
      'stop my order from shipping',
    ],
    outputs: ['order_cancel'],
  })
  .ask({
    id: 'collect_order_id',
    field: 'order_id',
    prompt: 'Which order do you want to cancel? Please share your order ID (for example ORD-1001).',
  })
  .tool({ id: 'lookup_order', tool_ref: 'order_status_check' })
  .condition({
    id: 'check_found',
    when: 'order_status_check.found == true',
    then: 'await_approval',
    else: 'report_missing',
  })
  .complete({
    id: 'report_missing',
    message: "I couldn't find an order with ID {{order_id}}, so there is nothing to cancel.",
  })
  .approval({
    id: 'await_approval',
    prompt:
      'Your cancellation request for order {{order_id}} has been sent to a supervisor for approval. I will confirm as soon as it is approved.',
  })
  .tool({ id: 'do_cancel', tool_ref: 'order_cancel' })
  .complete({
    id: 'confirm_cancelled',
    message: '{{order_cancel.message}}',
  });

const handle = await app.listen({ port });

console.log('order-approval example listening');
console.log(`  Webhook URL   : ${handle.url}`);
console.log(`  Signing secret: ${signingSecret}`);
console.log(`  Demo OTP      : ${DUMMY_OTP}`);
console.log('');
console.log('Flows advertised via capabilities.list:');
console.log('  track-order   ask -> tool -> condition -> complete');
console.log('  cancel-order  ask -> tool -> condition -> approval -> tool(auth) -> complete');
