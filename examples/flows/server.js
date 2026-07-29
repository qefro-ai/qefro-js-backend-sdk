import 'dotenv/config';
import { Qefro } from '@qefro-ai/backend';

const port = Number(process.env.PORT || 8088);
const app = new Qefro({ signingSecret: process.env.QEFRO_SIGNING_SECRET || 'dev-secret' });

const CUSTOMERS = {
  'jane@example.com': { id: 'cust-1001', name: 'Jane Cooper', email: 'jane@example.com' },
};

const ORDERS = {
  'cust-1001': [
    { order_id: 'ORD-1002', status: 'shipped', total: 129.5 },
    { order_id: 'ORD-1007', status: 'processing', total: 42.0 },
  ],
};

app.tool(
  {
    name: 'lookup_customer',
    description: 'Look up a customer record by email address.',
    lookup: { by: 'email' },
  },
  async (ctx) => {
    const email = String(ctx.parameters.email || ctx.identity.email || '').toLowerCase();
    return { customer: CUSTOMERS[email] ?? null };
  },
);

app.tool(
  {
    name: 'get_orders',
    description: 'Return recent orders for a customer id.',
  },
  async (ctx) => {
    const customerId = String(ctx.parameters.customer_id || '');
    return { orders: ORDERS[customerId] ?? [] };
  },
);

// Flows are metadata only: the SDK advertises them through capabilities.list
// and the Qefro Runtime orchestrates the steps. Nothing executes here.
app
  .flow({
    id: 'order_lookup',
    name: 'Order Lookup',
    description: 'Lookup customer orders',
    version: 1,
    category: 'crm',
    tags: ['customer', 'orders'],
    intent: ['track order', 'where is my order', 'find my shipment'],
    inputs: ['email'],
    outputs: ['customer', 'orders'],
  })
  .ask({ id: 'email', field: 'email', prompt: 'Please enter your email.' })
  .tool({ id: 'lookup', tool_ref: 'lookup_customer' })
  .tool({ id: 'orders', tool_ref: 'get_orders' })
  .complete({ id: 'done', message: 'Here are your recent orders.' });

await app.listen({ port });
console.log('Qefro flows example endpoint listening on port', port);
