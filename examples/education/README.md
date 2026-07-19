# Education Example

Academic operations integration for course discovery and enrollment.

## Tools
- course_catalog_search
- course_enrollment_request

## Focus
- catalog lookup patterns
- seat-aware enrollment checks with waitlist behavior

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"course_catalog_search","parameters":{}}
```

## Expected response shape
```json
{"type":"result","output":{"courses":[{"code":"MATH-101","title":"Foundations of Algebra"}]}}
```
