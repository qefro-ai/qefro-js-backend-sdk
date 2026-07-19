# Banking Example

Financial-service-safe starter with account and beneficiary checks.

## Tools
- account_balance_get
- beneficiary_validate

## Focus
- account existence and balance envelopes
- IBAN format checks with masking in responses

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"account_balance_get","parameters":{"account_id":"acct-01"}}
```

## Expected response shape
```json
{"type":"result","output":{"found":true,"accountId":"acct-01","account":{"currency":"USD"}}}
```
