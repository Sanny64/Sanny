#!/usr/bin/env bash
# Verifies two things from the TODO checklist:
#   1. The Fastify app (and Redis) are NOT reachable directly from outside Docker.
#   2. nginx's rate limiting actually returns 429 + Retry-After under load.
#
# Run this from your HOST machine (not inside a container), while the
# stack is up via `docker compose up`. Use Git Bash on Windows, or WSL2, or Linux, or macOS. It will not work in plain Windows CMD or PowerShell.

set -uo pipefail

NGINX_HTTPS="https://localhost:8443"
APP_DIRECT="http://localhost:3000"
REDIS_HOST="localhost"
REDIS_PORT="6379"
AUTH_PATH="/api/v001/auth"
REQUESTS=50

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
info()  { printf "\033[36m%s\033[0m\n" "$1"; }

echo "=============================================="
echo "1. Checking that the app is NOT directly exposed"
echo "=============================================="

info "Trying $APP_DIRECT/healthcheck directly (should FAIL to connect)..."
if curl -sS -m 3 "$APP_DIRECT/healthcheck" >/dev/null 2>&1; then
  red "FAIL: App answered directly on port 3000 - it should only be reachable via nginx."
else
  green "OK: Port 3000 is not reachable from outside Docker."
fi

info "Trying Redis on $REDIS_HOST:$REDIS_PORT directly (should FAIL to connect)..."
if command -v redis-cli >/dev/null 2>&1; then
  if timeout 3 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING >/dev/null 2>&1; then
    red "FAIL: Redis answered directly - it should not be exposed to the host at all."
  else
    green "OK: Redis is not reachable from outside Docker."
  fi
else
  # Fallback without redis-cli: a bare TCP connect attempt
  if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$REDIS_HOST/$REDIS_PORT" 2>/dev/null; then
    red "FAIL: Something is listening on $REDIS_HOST:$REDIS_PORT - Redis should not be exposed."
  else
    green "OK: Redis is not reachable from outside Docker."
  fi
fi

echo
echo "=============================================="
echo "2. Checking nginx TLS + reverse proxy works"
echo "=============================================="

info "Trying $NGINX_HTTPS/healthcheck through nginx (should SUCCEED)..."
status=$(curl -sk -o /dev/null -w "%{http_code}" -m 5 "$NGINX_HTTPS/healthcheck")
if [ "$status" = "200" ]; then
  green "OK: nginx proxies to the app correctly (200 on /healthcheck)."
else
  red "FAIL: Expected 200 via nginx, got $status. Is the stack up?"
fi

echo
echo "=============================================="
echo "3. Triggering rate limiting on $AUTH_PATH"
echo "=============================================="
info "Firing $REQUESTS rapid requests at $NGINX_HTTPS$AUTH_PATH ..."

got_429=false
retry_after_seen=false

for i in $(seq 1 "$REQUESTS"); do
  response=$(curl -sk -D - -o /dev/null -m 5 "$NGINX_HTTPS$AUTH_PATH")
  code=$(echo "$response" | head -n 1 | awk '{print $2}')

  if [ "$code" = "429" ]; then
    got_429=true
    if echo "$response" | grep -qi "^Retry-After:"; then
      retry_after_seen=true
    fi
    echo "  request #$i -> 429 (rate limited)"
    break
  fi
done

if [ "$got_429" = true ]; then
  green "OK: Received a 429 after enough requests."
  if [ "$retry_after_seen" = true ]; then
    green "OK: Retry-After header was present on the 429 response."
  else
    red "FAIL: 429 received, but no Retry-After header was found."
  fi
else
  red "FAIL: Never received a 429 within $REQUESTS requests. Rate limit may be too high, or auth route path is wrong."
fi

echo
echo "Done."