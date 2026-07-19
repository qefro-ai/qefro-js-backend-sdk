# @qefro-ai/backend

Qefro backend framework for Business Tool handlers and customer authorization.

Organizations expose one signed webhook (typically `POST /qefro`). Qefro Runtime calls `ping`, `tools.list`, `tool.invoke`, and `tool.resume`. Authentication (OTP, sessions) stays in your handlers — Qefro only relays challenges.

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

## Protocol

| Message | Purpose |
| --- | --- |
| `ping` | Health / Test Connection |
| `tools.list` | Discover handlers for Sync Tools |
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
