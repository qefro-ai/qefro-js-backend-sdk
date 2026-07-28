# Realtime Ops Example

Live operational state that changes between calls, with mixed auth modes.

## Tools
- `next_available_slots` (`auth: none`) — appointment slots computed from the current clock (9:00–18:00, 30-min grid)
- `track_delivery` (`auth: none`) — delivery status advances one stage every 2 minutes of real time (`DLV-501`, `DLV-502`)
- `join_support_queue` (`auth: optional`) — shared in-memory queue; verified customers are sorted ahead of guests
- `reschedule_my_appointment` (`auth: required`, `sms_otp`, lookup by `phone`) — verified write operation

## Focus
- time-derived and mutable in-memory state — every invocation reflects "now"
- `auth: optional` pattern: `ctx.customer.get()` is undefined for guests, set once the conversation is verified
- read tools public, write tool verified — a common production split

## Dev credentials
- OTP: `123456` (`DEV_OTP`)
- Customers: `+15550001111` (Alice), `+15550002222` (Bob)

## Run
1. cp .env.example .env
2. npm install
3. npm start

## Smoke Test
```bash
./scripts/smoke.sh
```

## Sample tool.invoke request
```json
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"phone":"+15550001111"},"tool":"track_delivery","parameters":{"delivery_id":"DLV-502"}}
```

Call `track_delivery` for `DLV-502` twice a few minutes apart to watch the status advance.
