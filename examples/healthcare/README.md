# Healthcare Example

Appointment operations flow for patient-facing support automations.

## Tools
- appointment_slots_list
- appointment_book

## Focus
- slot filtering by doctor/date
- booking confirmation with explicit unavailability signals

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"appointment_slots_list","parameters":{"doctor":"dr-sara","date":"2026-07-20"}}
```

## Expected response shape
```json
{"type":"result","output":{"count":2,"slots":[{"doctor":"dr-sara","time":"10:00"}]}}
```
