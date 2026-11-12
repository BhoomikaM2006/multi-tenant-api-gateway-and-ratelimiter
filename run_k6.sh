#!/usr/bin/env bash
set -e
cd /mnt/c/Projects/node-api-gateway

if ! curl -sf http://127.0.0.1:3000/health >/dev/null; then
  node src/mockBackend.js >/tmp/mock.log 2>&1 &
  MOCK_PID=$!
  node src/app.js >/tmp/gw.log 2>&1 &
  GW_PID=$!
  trap "kill $MOCK_PID $GW_PID 2>/dev/null || true" EXIT
  sleep 2
fi

redis-cli FLUSHDB >/dev/null
curl -sf -X PATCH http://127.0.0.1:3000/admin/tenants/tenant-free \
  -H "Content-Type: application/json" \
  -d '{"algorithm":"sliding_window"}' >/dev/null

TENANTS_JSON=$(curl -sf http://127.0.0.1:3000/admin/tenants)
FREE_KEY=$(node -e "const t = JSON.parse(process.argv[1]).tenants.find(x => x.tenant_id === 'tenant-free'); console.log(t.api_key);" "$TENANTS_JSON")
PRO_KEY=$(node -e "const t = JSON.parse(process.argv[1]).tenants.find(x => x.tenant_id === 'tenant-pro'); console.log(t.api_key);" "$TENANTS_JSON")
ENT_KEY=$(node -e "const t = JSON.parse(process.argv[1]).tenants.find(x => x.tenant_id === 'tenant-ent'); console.log(t.api_key);" "$TENANTS_JSON")

GATEWAY_URL="http://127.0.0.1:3000" FREE_KEY="$FREE_KEY" PRO_KEY="$PRO_KEY" ENT_KEY="$ENT_KEY" k6 run loadtest.js