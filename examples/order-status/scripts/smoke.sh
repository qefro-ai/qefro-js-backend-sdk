#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8090}"
QEFRO_SIGNING_SECRET="${QEFRO_SIGNING_SECRET:-dev-secret-order-status}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}/qefro}"
TOOL_NAME="order_status_check"
TOOL_PARAMS='{"order_id":"ORD-1002"}'

sign_body() {
  local ts="$1"
  local body="$2"
  local payload="v1:${ts}:${body}"
  local hex
  hex=$(printf '%s' "${payload}" | openssl dgst -sha256 -hmac "${QEFRO_SIGNING_SECRET}" -binary | xxd -p -c 256)
  printf 'v1=%s' "${hex}"
}

send_signed() {
  local body="$1"
  local ts sig
  ts=$(date +%s)
  sig=$(sign_body "${ts}" "${body}")
  curl -sS -X POST "${BASE_URL}" \
    -H "Content-Type: application/json" \
    -H "X-Qefro-Protocol: 1" \
    -H "X-Qefro-Timestamp: ${ts}" \
    -H "X-Qefro-Signature: ${sig}" \
    -d "${body}"
}

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

PORT="${PORT:-8090}"
QEFRO_SIGNING_SECRET="${QEFRO_SIGNING_SECRET:-dev-secret-order-status}"
BASE_URL="http://127.0.0.1:${PORT}/qefro"

node server.js >/tmp/qefro-smoke-order-status.log 2>&1 &
SERVER_PID=$!

for _ in {1..30}; do
  if curl -sS -o /dev/null -X POST "${BASE_URL}" --max-time 1 2>/dev/null; then
    break
  fi
  sleep 0.2
done

PING_BODY='{"protocol_version":"1","request_id":"smoke-ping","type":"ping"}'
LIST_BODY='{"protocol_version":"1","request_id":"smoke-list","type":"tools.list"}'
INVOKE_BODY="{\"protocol_version\":\"1\",\"request_id\":\"smoke-invoke\",\"type\":\"tool.invoke\",\"conversation_id\":\"smoke-conv\",\"identity\":{\"customer_id\":\"cust-alice\",\"phone\":\"+15550001111\"},\"tool\":\"${TOOL_NAME}\",\"parameters\":${TOOL_PARAMS}}"
LIST_ORDERS_BODY='{"protocol_version":"1","request_id":"smoke-list-orders","type":"tool.invoke","conversation_id":"smoke-conv","identity":{"customer_id":"cust-alice"},"tool":"my_orders_list","parameters":{"limit":5}}'

PING_RESPONSE=$(send_signed "${PING_BODY}")
LIST_RESPONSE=$(send_signed "${LIST_BODY}")
INVOKE_RESPONSE=$(send_signed "${INVOKE_BODY}")
ORDERS_RESPONSE=$(send_signed "${LIST_ORDERS_BODY}")

echo "Ping:   ${PING_RESPONSE}"
echo "Tools:  ${LIST_RESPONSE}"
echo "Status: ${INVOKE_RESPONSE}"
echo "Orders: ${ORDERS_RESPONSE}"

echo "${PING_RESPONSE}" | grep -q '"type":"pong"'
echo "${LIST_RESPONSE}" | grep -q 'order_status_check'
echo "${INVOKE_RESPONSE}" | grep -q '"type":"result"'
echo "${INVOKE_RESPONSE}" | grep -q 'shipped'
echo "${ORDERS_RESPONSE}" | grep -q '"type":"result"'

echo "Smoke test passed for order-status mock SDK"
