# Ecommerce Example

Retail operations flow with order support and post-purchase automation.

## Tools
- order_track
- return_create
- invoice_download_link

## Focus
- strict return reason normalization
- invoice link creation with short TTL metadata
- order existence validation

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"order_track","parameters":{"order_id":"ord-9001"}}
```

## Expected response shape
```json
{"type":"result","output":{"found":true,"order":{"id":"ord-9001","status":"in_transit"}}}
```
