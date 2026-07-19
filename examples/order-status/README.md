# Order Status Example

Local `@qefro-ai/backend` webhook for testing **SDK Connections**, Business Tool sync, and **OTP pause/resume**.

## Tools

| Tool | Auth | Purpose |
| --- | --- | --- |
| `order_status_check` | none | Look up order by `order_id` |
| `my_orders_list` | required (`email_otp`) | List orders after OTP challenge |

### Sample order IDs

| Order ID | Status | Customer |
| --- | --- | --- |
| `ORD-1001` | processing | cust-alice |
| `ORD-1002` | shipped | cust-alice |
| `ORD-2001` | delivered | cust-bob |
| `ORD-3001` | cancelled | cust-carol |

## OTP pause / resume (dev)

`my_orders_list` returns an `email_otp` challenge on first invoke. Qefro suspends the tool and asks the user for the code. The next reply is forwarded as `tool.resume`.

| Env | Default | Purpose |
| --- | --- | --- |
| `DEV_OTP` | `123456` | Hardcoded OTP accepted by this mock (testing only) |

Flow:

1. Ask: “Show my orders”
2. Assistant asks for the OTP (challenge message includes the dev code)
3. Reply: `123456`
4. Tool resumes and returns Alice’s / Bob’s orders

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

Covers ping, tools.list, public order lookup, OTP challenge, successful resume, and denied wrong OTP.

## Connect to Admin Console

1. Expose the webhook if the API is not on localhost (e.g. `ngrok http 8090`).
2. **Business Tools → SDK Connections → Add Connection** with the same signing secret.
3. **Test Connection**, then **Sync Tools** into a workspace.
4. Ask: “What’s the status of order ORD-1002?” (no OTP)
5. Ask: “Show my orders”, then enter `123456` when challenged
