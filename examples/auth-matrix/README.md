# Auth Matrix Example

Every auth mode and challenge type in one backend — the reference for wiring authentication.

## Auth coverage

| Tool | auth | Challenge | Identity lookup |
| --- | --- | --- | --- |
| `product_info` | `none` | — | — |
| `my_recommendations` | `optional` | — (personalizes if the conversation is already verified) | — |
| `my_profile` | `required` | `email_otp` | `email` |
| `update_shipping_address` | `required` | `sms_otp` | `phone` |
| `export_account_data` | `required` | `login` (redirect to your login page) | — |
| `approve_refund` | `required` | `custom` (out-of-band approval code) | — |

Authorize outcomes exercised: `success`, `challenge`, `denied` (wrong code), `not_found` (unknown identity).

## Dev credentials

- OTP (email + SMS): `123456` (`DEV_OTP`)
- Login resume code: `LOGGED-IN`
- Custom approval code: `APPROVE-42` (`DEV_APPROVAL_CODE`)
- Customers: `alice@example.com` / `+15550001111`, `bob@example.com` / `+15550002222`

## Run
1. cp .env.example .env
2. npm install
3. npm start

## Smoke Test
```bash
./scripts/smoke.sh
```

## Try the challenge flow

Invoke `my_profile` with identity `{"email":"alice@example.com"}` → response is `type: "challenge"` with a `resume_token`. Send `tool.resume` (the request must repeat the `tool` name) with `challenge_response: "123456"` → `type: "result"`. A wrong code returns `code: "denied"`; an unknown email returns `code: "customer_not_found"`. Once verified, the conversation's auth is cached — further `required` tools and `my_recommendations` run without a new challenge.

```json
{"protocol_version":"1","request_id":"example-resume","type":"tool.resume","conversation_id":"example-conv","tool":"my_profile","resume_token":"<from challenge>","challenge_response":"123456"}
```

## Sample tool.invoke request
```json
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"email":"alice@example.com"},"tool":"product_info","parameters":{"sku":"SKU-1"}}
```
