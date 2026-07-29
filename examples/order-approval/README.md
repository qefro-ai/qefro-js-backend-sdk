# order-approval

The end-to-end **runtime Business Flows** example: a cancellation flow that the
Qefro Runtime actually executes, combining every waiting state —

```
cancel-order:  ask -> tool -> condition -> approval (human) -> tool (auth: OTP) -> complete
track-order:   ask -> tool -> condition -> complete
```

What each piece demonstrates:

- **`ask` + templating** — collects `order_id`, later referenced as `{{order_id}}`
  and `{{order_status_check.status}}` in prompts.
- **`condition`** — branches on the previous tool's output
  (`order_status_check.found == true`).
- **`approval`** — pauses the run until an Owner/Admin clicks **Approve** in
  Admin Console → **Flow Runs**. The confirmation is delivered back to the
  customer's channel (WhatsApp / widget) even though they are not mid-request.
- **`tool` with `auth: 'required'`** — the runtime triggers the customer
  provider's `authorize` challenge (demo OTP `123456`) before `order_cancel`
  runs, then resumes the flow with the verified customer.

The SDK still never executes steps: flows are advertised via
`capabilities.list`, and the Runtime calls back into `order_status_check` /
`order_cancel` over the same signed webhook when a `tool` step runs.

## Run

```bash
cp .env.example .env
npm install
npm start
```

## Smoke test

```bash
./scripts/smoke.sh
```

Sends signed `ping` and `capabilities.list` requests and asserts both flows,
the `approval` step, and the `order_cancel` tool_ref are advertised.

## Try it live

1. Expose the webhook (`ngrok http 8091`) and add an SDK Connection in
   Admin Console → **Business Tools → SDK Connections** with the same secret.
2. **Sync Tools**, then enable both flows in the connection's Business Flows list.
3. In chat: “cancel my order” → give `ORD-1001` → watch **Flow Runs** → Approve →
   the customer is asked for OTP `123456` → cancellation confirmed.

Docs: [Run Business Flows](https://docs.qefro.com/docs/guides/run-business-flows)
