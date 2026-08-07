# @qefro-ai/backend

Qefro backend framework for Business Tool handlers and customer authorization.

Organizations expose one signed webhook (typically `POST /qefro`). Qefro Runtime calls `ping`, `capabilities.list`, `tool.invoke`, and `tool.resume`. Authentication (OTP, sessions) stays in your handlers — Qefro only relays challenges.

## Install

```bash
npm install @qefro-ai/backend
```

## Quick start

```ts
import { Qefro } from '@qefro-ai/backend';

const app = new Qefro({
  signingSecret: process.env.QEFRO_SIGNING_SECRET!,
});

app.customer({
  async lookup(ctx) {
    return { id: String(ctx.identity.phone ?? 'demo') };
  },
  async authorize(ctx) {
    return {
      kind: 'success',
      customer: ctx.customer,
      auth: { type: 'bearer_token', access_token: 'dev', expires_in: 900 },
    };
  },
});

app.tool(
  {
    name: 'order_status_check',
    description: 'Look up order status by ID',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
      },
      required: ['order_id'],
    },
  },
  async (ctx) => {
    return { order_id: ctx.parameters.order_id, status: 'shipped' };
  },
);

await app.listen({ port: 8088, path: '/qefro' });
```

Set the same signing secret in Admin Console → **Business Tools → SDK Connections**, then **Sync Tools**.

Docs: [Register SDK Business Tools](https://docs.qefro.com/docs/guides/register-sdk-business-tools)

## Managed storage (`ctx.storage`)

Application tools persist via managed storage (ADR-002 / ADR-003). Never call
Mongo or storage-service URLs yourself — use the SDK:

```ts
app.tool(
  {
    name: 'restaurant.createReservation',
    description: 'Create a table reservation',
    auth: 'none',
    input_schema: {
      type: 'object',
      properties: {
        guest_name: { type: 'string' },
        covers: { type: 'number' },
        date: { type: 'string' },
        time: { type: 'string' },
      },
      required: ['guest_name', 'covers', 'date', 'time'],
    },
  },
  async (ctx) => {
    return ctx.storage.insert(
      'reservations',
      {
        customer_name: ctx.parameters.guest_name,
        guest_count: ctx.parameters.covers,
        reservation_time: `${ctx.parameters.date} ${ctx.parameters.time}`,
        status: 'confirmed',
      },
      { allocate_code: { prefix: 'R-', start: 1001 } },
    );
  },
);
```

`tool.invoke` may include `platform.storage.{base_url,token,context}`. Managed
hosts can also set `QEFRO_STORAGE_URL` + `QEFRO_SERVICE_TOKEN`.

## Business Flows

Flows describe how your Business Tools are orchestrated. They are **metadata only** — the SDK advertises them through `capabilities.list` and the Qefro Runtime discovers, validates, versions, and (later) executes them. Nothing runs inside the SDK.

```ts
app
  .flow({
    id: 'order_lookup',            // immutable identity — renaming `name` never creates a new flow
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
```

Every step needs a unique `id`; `tool` steps reference an existing Business Tool by `tool_ref`. Step builders: `.ask() .tool() .challenge() .upload() .condition() .delay() .approval() .complete() .message() .tag() .assign() .activity()`. See [`examples/flows`](examples/flows) and [`examples/person-hub-flows`](examples/person-hub-flows).

### Customer Hub (`ctx.person`)

Keep connector customer and Qefro Person separate:

```ts
// External systems (CRM, orders, org auth)
await ctx.customer.lookup();

// Qefro memory (Customer Hub)
const person = ctx.person.get();
await ctx.person.tag('vip');
await ctx.person.assign('sales');
await ctx.person.activity('note.logged', { payload: { source: 'tool' } });
```

Event triggers:

```ts
import { onPersonCreated, PersonEvents } from '@qefro-ai/backend';

app.flow({
  id: 'welcome',
  trigger: onPersonCreated(), // or { type: 'event', event: PersonEvents.Created }
})
  .message({ id: 'hi', message: 'Hi {{person.name}}' })
  .complete({ id: 'done' });
```

Docs: [Define Business Flows](https://docs.qefro.com/docs/guides/define-business-flows)

## Examples

Runnable backends (ecommerce, CRM, order-status, WhatsApp, and more) live in [`examples/`](examples/README.md):

```bash
git clone https://github.com/qefro-ai/qefro-js-backend-sdk.git
cd qefro-js-backend-sdk/examples/basic-sdk
cp .env.example .env
npm install
npm start
# optional: ./scripts/smoke.sh
```

## Protocol

| Message | Purpose |
| --- | --- |
| `ping` | Health / Test Connection |
| `capabilities.list` | Discover tools **and** business flows for Sync Tools |
| `tools.list` | Legacy tool-only discovery (still supported) |
| `tool.invoke` | Run a handler |
| `tool.resume` | Continue after a customer challenge reply |

Requests are HMAC-SHA256 signed (`X-Qefro-Signature`). Use a shared random secret — not an ed25519 keypair.

## License

MIT

## Publishing (maintainers)

CI publishes to npm via [.github/workflows/publish-npm.yml](.github/workflows/publish-npm.yml).

1. Create an npm **granular access token** (Automation / Bypass 2FA) with write access to `@qefro-ai`.
2. In GitHub → **Settings → Secrets and variables → Actions**, add secret `NPM_TOKEN`.
3. Publish either:
   - **Actions → Publish npm → Run workflow**, or
   - Create a GitHub Release (triggers publish automatically).

Bump `version` in `package.json` before publishing a new release.
