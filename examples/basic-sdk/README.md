# Basic SDK Example

Foundational backend pattern for Qefro SDK integrations.

## Tools
- customer_profile_get
- session_context_set

## Focus
- clean customer lookup and auth split
- minimal but production-safe argument handling

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"customer_profile_get","parameters":{}}
```

## Expected response shape
```json
{"type":"result","output":{"customer":{"id":"demo-customer"},"capabilities":["orders","tickets","payments"]}}
```
