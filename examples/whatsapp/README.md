# WhatsApp Example

Channel-specific integration for WhatsApp template and send flows.

## Tools
- wa_template_preview
- wa_message_send

## Focus
- preview-before-send pattern
- provider-like tracking metadata on send

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"wa_template_preview","parameters":{"template":"order_update"}}
```

## Expected response shape
```json
{"type":"result","output":{"template":"order_update","approved":true}}
```
