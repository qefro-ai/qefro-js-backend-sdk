# Live Data Example

Realtime tools that fetch live data from public keyless APIs at invoke time.

## Tools
- `crypto_price` — live crypto spot price + 24h change (CoinGecko)
- `fx_rate` — live FX conversion (Frankfurter / ECB)
- `weather_now` — current weather for any city (Open-Meteo)

## Focus
- calling upstream HTTP APIs inside tool handlers (Node 18+ `fetch`)
- hard upstream timeouts (`AbortSignal.timeout`) so tool calls never hang the agent
- graceful `upstream_unavailable` error shape the agent can relay to users
- all tools are `auth: 'none'` — no customer provider needed

## Run
1. cp .env.example .env
2. npm install
3. npm start

Requires outbound internet access. `UPSTREAM_TIMEOUT_MS` (default 6000) caps each upstream call.

## Smoke Test
```bash
./scripts/smoke.sh
```

## Sample tool.invoke request
```json
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{},"tool":"fx_rate","parameters":{"from":"USD","to":"INR","amount":100}}
```

## Expected response shape
```json
{"type":"result","output":{"ok":true,"from":"USD","to":"INR","amount":100,"converted":8375.4,"rate_date":"2026-07-28"}}
```
