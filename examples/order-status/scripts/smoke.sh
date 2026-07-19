#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8090}"
QEFRO_SIGNING_SECRET="${QEFRO_SIGNING_SECRET:-dev-secret-order-status}"
DEV_OTP="${DEV_OTP:-123456}"
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
DEV_OTP="${DEV_OTP:-123456}"
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
CHALLENGE_BODY='{"protocol_version":"1","request_id":"smoke-orders","type":"tool.invoke","conversation_id":"smoke-otp-conv","identity":{"customer_id":"cust-alice"},"tool":"my_orders_list","parameters":{"limit":5}}'

PING_RESPONSE=$(send_signed "${PING_BODY}")
LIST_RESPONSE=$(send_signed "${LIST_BODY}")
INVOKE_RESPONSE=$(send_signed "${INVOKE_BODY}")
CHALLENGE_RESPONSE=$(send_signed "${CHALLENGE_BODY}")

echo "Ping:      ${PING_RESPONSE}"
echo "Tools:     ${LIST_RESPONSE}"
echo "Status:    ${INVOKE_RESPONSE}"
echo "Challenge: ${CHALLENGE_RESPONSE}"

echo "${PING_RESPONSE}" | grep -q '"type":"pong"'
echo "${LIST_RESPONSE}" | grep -q 'order_status_check'
echo "${INVOKE_RESPONSE}" | grep -q '"type":"result"'
echo "${INVOKE_RESPONSE}" | grep -q 'shipped'
echo "${CHALLENGE_RESPONSE}" | grep -q '"type":"challenge"'
echo "${CHALLENGE_RESPONSE}" | grep -q 'email_otp'

RESUME_TOKEN=$(printf '%s' "${CHALLENGE_RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["resume_token"])')
RESUME_BODY=$(printf '{"protocol_version":"1","request_id":"smoke-resume","type":"tool.resume","conversation_id":"smoke-otp-conv","identity":{"customer_id":"cust-alice"},"tool":"my_orders_list","parameters":{"limit":5},"resume_token":"%s","challenge_response":"%s"}' "${RESUME_TOKEN}" "${DEV_OTP}")
RESUME_RESPONSE=$(send_signed "${RESUME_BODY}")

echo "Resume:    ${RESUME_RESPONSE}"

echo "${RESUME_RESPONSE}" | grep -q '"type":"result"'
echo "${RESUME_RESPONSE}" | grep -q 'ORD-1002'

# Wrong OTP should deny
BAD_CHALLENGE=$(send_signed '{"protocol_version":"1","request_id":"smoke-bad","type":"tool.invoke","conversation_id":"smoke-otp-bad","identity":{"customer_id":"cust-bob"},"tool":"my_orders_list","parameters":{"limit":1}}')
BAD_TOKEN=$(printf '%s' "${BAD_CHALLENGE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["resume_token"])')
BAD_RESUME=$(send_signed "$(printf '{"protocol_version":"1","request_id":"smoke-bad-resume","type":"tool.resume","conversation_id":"smoke-otp-bad","identity":{"customer_id":"cust-bob"},"tool":"my_orders_list","parameters":{"limit":1},"resume_token":"%s","challenge_response":"000000"}' "${BAD_TOKEN}")")
echo "Bad OTP:   ${BAD_RESUME}"
echo "${BAD_RESUME}" | grep -q '"code":"denied"'

echo "Smoke test passed for order-status mock SDK (incl. OTP pause/resume)"
