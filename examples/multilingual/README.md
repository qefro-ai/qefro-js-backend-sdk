# Multilingual Example

Locale-aware response orchestration for international customer operations.

## Tools
- language_detect_and_set
- message_localize

## Focus
- locale normalization and fallback
- localized greeting and handoff generation

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"message_localize","parameters":{"locale":"fr","name":"Amira"}}
```

## Expected response shape
```json
{"type":"result","output":{"locale":"fr","greeting":"Bonjour, Amira."}}
```
