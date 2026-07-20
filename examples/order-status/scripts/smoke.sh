#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8090}"
QEFRO_SIGNING_SECRET="${QEFRO_SIGNING_SECRET:-dev-secret-order-status}"
DEV_OTP="${DEV_OTP:-123456}"
LOOKUP_BY="${LOOKUP_BY:-email}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}/qefro}"

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
LOOKUP_BY="${LOOKUP_BY:-email}"
BASE_URL="http://127.0.0.1:${PORT}/qefro"
export LOOKUP_BY DEV_OTP QEFRO_SIGNING_SECRET PORT

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
INVOKE_BODY='{"protocol_version":"1","request_id":"smoke-invoke","type":"tool.invoke","conversation_id":"smoke-conv","identity":{"customer_id":"cust-alice"},"tool":"order_status_check","parameters":{"order_id":"ORD-1002"}}'

if [[ "${LOOKUP_BY}" == "phone" ]]; then
  CHALLENGE_BODY='{"protocol_version":"1","request_id":"smoke-orders","type":"tool.invoke","conversation_id":"smoke-otp-conv","channel":"whatsapp","identity":{"phone":"+15550001111","channel":"whatsapp"},"tool":"my_orders_list","parameters":{"limit":5}}'
else
  CHALLENGE_BODY='{"protocol_version":"1","request_id":"smoke-orders","type":"tool.invoke","conversation_id":"smoke-otp-conv","channel":"portal","identity":{"email":"alice@example.com","channel":"portal"},"tool":"my_orders_list","parameters":{"limit":5}}'
fi

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
echo "${LIST_RESPONSE}" | grep -q '"lookup"'
echo "${INVOKE_RESPONSE}" | grep -q '"type":"result"'
echo "${INVOKE_RESPONSE}" | grep -q 'shipped'
echo "${CHALLENGE_RESPONSE}" | grep -q '"type":"challenge"'

RESUME_TOKEN=$(printf '%s' "${CHALLENGE_RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["resume_token"])')
if [[ "${LOOKUP_BY}" == "phone" ]]; then
  RESUME_BODY=$(printf '{"protocol_version":"1","request_id":"smoke-resume","type":"tool.resume","conversation_id":"smoke-otp-conv","channel":"whatsapp","identity":{"phone":"+15550001111","channel":"whatsapp"},"tool":"my_orders_list","parameters":{"limit":5},"resume_token":"%s","challenge_response":"%s"}' "${RESUME_TOKEN}" "${DEV_OTP}")
else
  RESUME_BODY=$(printf '{"protocol_version":"1","request_id":"smoke-resume","type":"tool.resume","conversation_id":"smoke-otp-conv","channel":"portal","identity":{"email":"alice@example.com","channel":"portal"},"tool":"my_orders_list","parameters":{"limit":5},"resume_token":"%s","challenge_response":"%s"}' "${RESUME_TOKEN}" "${DEV_OTP}")
fi
RESUME_RESPONSE=$(send_signed "${RESUME_BODY}")
echo "Resume:    ${RESUME_RESPONSE}"
echo "${RESUME_RESPONSE}" | grep -q '"type":"result"'
echo "${RESUME_RESPONSE}" | grep -q 'ORD-1002'

echo "Smoke test passed for order-status (lookup.by=${LOOKUP_BY}, OTP pause/resume)"
