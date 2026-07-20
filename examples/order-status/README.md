# Order Status Example

Local `@qefro-ai/backend` webhook for **SDK Connections**, sync, and **OTP pause/resume**.

## Identity model (generic resolver)

This tool advertises what it needs — it does **not** hardcode WhatsApp / Widget / Portal rules:

```js
lookup: { required: ['email'] }  // or ['phone']; set LOOKUP_BY
```

Qefro runtime resolution order:

1. Verified / channel identity  
2. Stored conversation values  
3. Tool arguments  
4. Ask the user  

| Channel | `LOOKUP_BY=email` | `LOOKUP_BY=phone` |
| --- | --- | --- |
| Portal / Admin | uses login email → invoke | asks for phone |
| WhatsApp | asks for email | uses WhatsApp phone → invoke |
| Widget | asks for email | asks for phone |

Then the SDK sends OTP (`DEV_OTP`, default `123456`) and lists orders after resume.

## Tools

| Tool | Auth | Lookup | Purpose |
| --- | --- | --- | --- |
| `order_status_check` | none | — | Look up by `order_id` |
| `my_orders_list` | required | `email` or `phone` | List orders after OTP |

### Customers

| ID | Email | Phone |
| --- | --- | --- |
| cust-alice | alice@example.com | +15550001111 |
| cust-bob | bob@example.com | +15550002222 |
| cust-carol | carol@example.com | +15550003333 |

Portal/Admin: any login email that is not in the table is mapped to Alice’s orders in this **dev mock** only.

### Sample order IDs

| Order ID | Status | Customer |
| --- | --- | --- |
| ORD-1001 | processing | cust-alice |
| ORD-1002 | shipped | cust-alice |
| ORD-2001 | delivered | cust-bob |
| ORD-3001 | cancelled | cust-carol |

## Run

```bash
cd examples/order-status
cp .env.example .env
npm install
npm start
```

```bash
./scripts/smoke.sh
```

## Connect

1. SDK Connections → webhook + signing secret  
2. Sync Tools (stores `lookup_required` on the tool)  
3. Playground: New Conversation → “show my orders” → OTP `123456`  
4. Widget: may ask for email first, then OTP  
