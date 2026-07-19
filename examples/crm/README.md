# CRM Example

Sales-assist integration with lead workflows and escalation paths.

## Tools
- crm_leads_list
- crm_note_add
- crm_ticket_open

## Focus
- owner-scoped lead retrieval
- note content validation
- priority-normalized escalation tickets

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
{"protocol_version":"1","request_id":"example-invoke","type":"tool.invoke","conversation_id":"example-conv","identity":{"customer_id":"demo-customer","phone":"+15550001111","locale":"en"},"tool":"crm_leads_list","parameters":{}}
```

## Expected response shape
```json
{"type":"result","output":{"owner":"sales-ae-1","total":2,"data":[{"id":"lead-11"}]}}
```
