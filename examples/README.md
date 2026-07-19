# @qefro-ai/backend examples

Runnable backends that expose `POST /qefro` for Qefro Runtime (`ping`, `tools.list`, `tool.invoke`, `tool.resume`).

These examples live in this repository so they always match the published `@qefro-ai/backend` package.

## Run any example

```bash
cd examples/<example>
cp .env.example .env
npm install
npm start
```

Each example depends on the local package via `file:../..`. For a published install, use:

```bash
npm install @qefro-ai/backend
```

## Smoke test

```bash
cd examples/<example>
./scripts/smoke.sh
```

Starts the server and sends signed `ping`, `tools.list`, and `tool.invoke` requests.

## Example matrix

| Example | Focus |
| --- | --- |
| `basic-sdk` | Minimal profile + session context tools |
| `order-status` | Public order lookup + authenticated my-orders list |
| `rest-api` | REST-shaped order query tools |
| `ecommerce` | Tracking, returns, invoice URLs |
| `crm` | Leads, notes, escalation tickets |
| `erp` | Inventory, PO drafts, sales-order ETA |
| `helpdesk` | Ticket intake + KB search |
| `banking` | Balance checks + beneficiary validation |
| `healthcare` | Appointment slots + booking |
| `education` | Catalog search + enrollment |
| `multilingual` | Locale detection + localization |
| `whatsapp` | Template preview + send simulation |
| `internal-portal` | KPI snapshot + approval workflow |

## Connect to Admin Console

1. Expose the webhook (e.g. `ngrok http 8088` → `https://….ngrok-free.app/qefro`).
2. **Business Tools → SDK Connections → Add Connection** with the same signing secret as `.env`.
3. **Test Connection**, then **Sync Tools** into a workspace.
4. Ask the agent to call a tool (for example order `ORD-1002` in `order-status`).

Docs: [Register SDK Business Tools](https://docs.qefro.com/docs/guides/register-sdk-business-tools)
