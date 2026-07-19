# ERP Example

Back-office operations example for inventory and procurement workflows.

## Tools
- inventory_balance_get
- purchase_order_create
- sales_order_eta

## Focus
- SKU inventory visibility
- validated PO draft creation
- ETA logic based on available stock

## Run
1. cp .env.example .env
2. npm install
3. npm start

## Smoke Test
Run one command to start the server, send signed requests for ping, tools.list, and tool.invoke, then assert successful responses.

```bash
./scripts/smoke.sh
```

## Sample tool.invoke request
```json
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"inventory_balance_get","parameters":{"sku":"SKU-100"}}
```

## Expected response shape
```json
{"type":"result","output":{"found":true,"sku":"SKU-100","available":308}}
```
