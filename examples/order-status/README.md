# Order Status Example

Local `@qefro-ai/backend` webhook for testing **SDK Connections** and Business Tool sync.

## Tools

| Tool | Auth | Purpose |
| --- | --- | --- |
| `order_status_check` | none | Look up order by `order_id` |
| `my_orders_list` | required | List orders for the current customer identity |

### Sample order IDs

| Order ID | Status | Customer |
| --- | --- | --- |
| `ORD-1001` | processing | cust-alice |
| `ORD-1002` | shipped | cust-alice |
| `ORD-2001` | delivered | cust-bob |
| `ORD-3001` | cancelled | cust-carol |

## Run

```bash
cd examples/order-status
cp .env.example .env
npm install
npm start
```

Default webhook: `http://127.0.0.1:8090/qefro`  
Default secret: `dev-secret-order-status`

### Smoke test

```bash
./scripts/smoke.sh
```

## Connect to Admin Console

1. Expose the webhook if the API is not on localhost (e.g. `ngrok http 8090`).
2. **Business Tools → SDK Connections → Add Connection** with the same signing secret.
3. **Test Connection**, then **Sync Tools** into a workspace.
4. Ask: “What’s the status of order ORD-1002?”
