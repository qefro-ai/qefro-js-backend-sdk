# REST API Mapping Example

Demonstrates SDK tools shaped like common REST order endpoints.

## Tools
- orders_list
- orders_get

## Focus
- map GET /orders and GET /orders/{id} style behavior
- return stable response envelopes for runtime consumption

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"orders_list","parameters":{}}
```

## Expected response shape
```json
{"type":"result","output":{"data":[{"id":"ord-1001","status":"shipped"}],"count":2}}
```
