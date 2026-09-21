#!/usr/bin/env bash
# =============================================================================
# Chettinad Care v2 — Staging Smoke Test
# =============================================================================
# Validates a deployed staging backend by testing health, authentication,
# authenticated requests, token refresh, and logout.
#
# Usage:
#   STAGING_API_URL=https://your-api.onrender.com \
#   STAGING_ADMIN_ID=staging_admin \
#   STAGING_ADMIN_PASSWORD=<secure-password> \
#   bash scripts/staging-smoke-test.sh
#
# Exit code: 0 on success, 1 on any failure.
# =============================================================================

set -euo pipefail

: "${STAGING_API_URL:?STAGING_API_URL is required (e.g. https://your-api.onrender.com)}"
: "${STAGING_ADMIN_ID:?STAGING_ADMIN_ID is required}"
: "${STAGING_ADMIN_PASSWORD:?STAGING_ADMIN_PASSWORD is required}"

# Normalize trailing slash
API="${STAGING_API_URL%/}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local status="$2"
  local expected="$3"
  if [ "$status" = "$expected" ]; then
    echo "  ✓ $name (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected HTTP $expected, got HTTP $status"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Chettinad Care v2 — Staging Smoke Test"
echo "Target: $API"
echo "======================================="
echo ""

# --- 1. Health check ---
echo "[1/5] Health endpoint"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/health")
check "GET /api/v1/health" "$HEALTH_STATUS" "200"

HEALTH_BODY=$(curl -s "$API/api/v1/health")
if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  echo "  ✓ Health status: ok"
  PASS=$((PASS + 1))
else
  echo "  ✗ Health status is not 'ok'"
  echo "    Response: $HEALTH_BODY"
  FAIL=$((FAIL + 1))
fi

# Verify health does not leak secrets
for forbidden in "jwt_secret" "database_url" "password" "JWT_SECRET" "DATABASE_URL"; do
  if echo "$HEALTH_BODY" | grep -qi "$forbidden"; then
    echo "  ✗ Health response contains '$forbidden' — possible secret leak"
    FAIL=$((FAIL + 1))
  fi
done

# --- 2. Login ---
echo ""
echo "[2/5] Staff login"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API/api/v1/auth/login/staff" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$STAGING_ADMIN_ID\",\"password\":\"$STAGING_ADMIN_PASSWORD\"}" \
  -c /tmp/cc_smoke_cookies.txt)
LOGIN_STATUS=$(echo "$LOGIN_RESPONSE" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')
check "POST /api/v1/auth/login/staff" "$LOGIN_STATUS" "200"

ACCESS_TOKEN=$(echo "$LOGIN_BODY" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$ACCESS_TOKEN" ]; then
  echo "  ✓ Access token received"
  PASS=$((PASS + 1))
else
  echo "  ✗ No access token in response"
  FAIL=$((FAIL + 1))
fi

# --- 3. Authenticated request ---
echo ""
echo "[3/5] Authenticated request"
if [ -n "$ACCESS_TOKEN" ]; then
  SESSION_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/opd/session" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  check "GET /api/v1/opd/session" "$SESSION_STATUS" "200"
else
  echo "  ⊘ Skipped — no access token"
fi

# --- 4. Refresh ---
echo ""
echo "[4/5] Token refresh"
if [ -f /tmp/cc_smoke_cookies.txt ]; then
  REFRESH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API/api/v1/auth/refresh" \
    -H "Content-Type: application/json" \
    -b /tmp/cc_smoke_cookies.txt \
    -c /tmp/cc_smoke_cookies_refreshed.txt \
    -d '{}')
  REFRESH_STATUS=$(echo "$REFRESH_RESPONSE" | tail -1)
  check "POST /api/v1/auth/refresh" "$REFRESH_STATUS" "200"
else
  echo "  ⊘ Skipped — no cookie jar"
fi

# --- 5. Logout ---
echo ""
echo "[5/5] Logout"
COOKIE_FILE="/tmp/cc_smoke_cookies_refreshed.txt"
[ ! -f "$COOKIE_FILE" ] && COOKIE_FILE="/tmp/cc_smoke_cookies.txt"
if [ -f "$COOKIE_FILE" ]; then
  LOGOUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/auth/logout" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{}')
  check "POST /api/v1/auth/logout" "$LOGOUT_STATUS" "200"
else
  echo "  ⊘ Skipped — no cookie jar"
fi

# --- Cleanup ---
rm -f /tmp/cc_smoke_cookies.txt /tmp/cc_smoke_cookies_refreshed.txt

# --- Summary ---
echo ""
echo "======================================="
echo "Results: $PASS passed, $FAIL failed"
echo "======================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo ""
echo "All staging smoke tests passed."
exit 0
