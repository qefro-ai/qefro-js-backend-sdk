# flows

Registers two Business Tools and one Business Flow (`order_lookup`) that references them.

Flows are metadata only: the SDK advertises them through `capabilities.list` and the
Qefro Runtime orchestrates execution. The SDK never runs flow steps.

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

Sends signed `ping` and `capabilities.list` requests and asserts the flow
(`order_lookup`) and its `tool_ref` steps are advertised.
