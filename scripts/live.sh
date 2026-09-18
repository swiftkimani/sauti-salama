#!/usr/bin/env bash
# Runs the server behind a public HTTPS tunnel so Africa's Talking can reach it.
# Saves the tunnel address to PUBLIC_BASE_URL in .env and restarts the server (keeping the
# same address) whenever .env is saved, e.g. after adding AT_API_KEY. Stop everything with Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "cloudflared is not installed. Run: brew install cloudflared"; exit 1; }
[ -f .env ] || { echo "No .env file. Run: cp .env.example .env"; exit 1; }

echo "Building..."
npm run build --silent

LOG=$(mktemp -t sauti-tunnel.XXXXXX)
TUNNEL=""
SERVER=""
URL=""
cleanup() { kill $TUNNEL $SERVER 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

# A quick-tunnel address is several hyphenated words. cloudflared's error messages also mention
# https://api.trycloudflare.com, which must never be taken for the tunnel.
QUICK_URL='https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com'

start_tunnel() {
  URL=""
  for attempt in 1 2 3; do
    : > "$LOG"
    cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT:-3000}" >"$LOG" 2>&1 &
    TUNNEL=$!
    for _ in $(seq 1 60); do
      URL=$(grep -Eo "$QUICK_URL" "$LOG" | head -1 || true)
      [ -n "$URL" ] && break
      kill -0 "$TUNNEL" 2>/dev/null || break
      sleep 0.5
    done
    if [ -n "$URL" ]; then
      # trycloudflare sometimes hands out an address and drops it moments later; make sure it stuck.
      sleep 5
      if tunnel_lost; then
        echo "Attempt $attempt: Cloudflare dropped the tunnel right after creating it."
        kill "$TUNNEL" 2>/dev/null || true
        URL=""
      else
        return 0
      fi
    else
      kill "$TUNNEL" 2>/dev/null || true
      echo "Attempt $attempt: Cloudflare did not create a tunnel:"
      grep -iE 'error|fail' "$LOG" | tail -3 || tail -3 "$LOG"
    fi
    [ "$attempt" -lt 3 ] && { echo "Retrying in 5 seconds..."; sleep 5; }
  done
  return 1
}

# True when the tunnel process is gone, or Cloudflare has stopped recognising this tunnel (cloudflared then
# retries a hostname that no longer resolves, so the line looks up but nothing can reach it).
tunnel_lost() {
  kill -0 "$TUNNEL" 2>/dev/null || return 0
  tail -20 "$LOG" | grep -qiE "Tunnel not found|Unregistered tunnel" && return 0
  return 1
}

save_url() {
  if grep -q '^PUBLIC_BASE_URL=' .env; then
    sed -i.bak "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=$URL#" .env && rm -f .env.bak
  else
    echo "PUBLIC_BASE_URL=$URL" >> .env
  fi
}

OLD=$(grep '^PUBLIC_BASE_URL=' .env | cut -d= -f2- || true)
start_tunnel || { echo "No tunnel after 3 attempts. Check the internet connection, or try again in a few minutes (trycloudflare.com has no uptime guarantee)."; exit 1; }
save_url
echo "Public URL: $URL (saved to .env)"
[ "$OLD" != "$URL" ] && echo "The address changed: run 'npm run at:check' and update the callback URLs on Africa's Talking."

mtime() { stat -f %m .env 2>/dev/null || stat -c %Y .env; }
start_server() { node dist/main.js & SERVER=$!; }
start_server
LAST=$(mtime)
while kill -0 "$SERVER" 2>/dev/null; do
  if tunnel_lost; then
    echo; echo "Cloudflare dropped $URL. Getting a new address..."; echo
    kill "$TUNNEL" 2>/dev/null || true
    if start_tunnel; then
      save_url
      LAST=$(mtime)   # our own write; the server is restarted below for the new address
      echo "Public URL: $URL (saved to .env)"
      echo "The address changed: run 'npm run at:check' and update the callback URLs on Africa's Talking."
      kill "$SERVER" 2>/dev/null || true
      wait "$SERVER" 2>/dev/null || true
      start_server
    else
      echo "Could not get another tunnel. The server is still running on http://localhost:${PORT:-3000}; run 'npm run live' again later."
      exit 1
    fi
  fi
  sleep 2
  NOW=$(mtime)
  if [ "$NOW" != "$LAST" ]; then
    LAST=$NOW
    echo; echo ".env changed: restarting the server (public URL stays $URL)"; echo
    kill "$SERVER" 2>/dev/null || true
    wait "$SERVER" 2>/dev/null || true
    start_server
  fi
done
echo "The server stopped."
