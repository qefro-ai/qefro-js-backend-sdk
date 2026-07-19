# Internal Portal Example

Employee-facing operations integration with approvals and KPI visibility.

## Tools
- ops_kpi_snapshot
- ops_approval_submit
- ops_approval_list

## Focus
- dashboard KPI snapshots
- approval submission validation and audit listing

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"ops_kpi_snapshot","parameters":{}}
```

## Expected response shape
```json
{"type":"result","output":{"metrics":{"openIncidents":3,"slaAtRisk":1}}}
```
