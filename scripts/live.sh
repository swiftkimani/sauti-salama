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
cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT:-3000}" >"$LOG" 2>&1 &
TUNNEL=$!
SERVER=""
cleanup() { kill $TUNNEL $SERVER 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

URL=""
for _ in $(seq 1 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 0.5
done
[ -n "$URL" ] || { echo "The tunnel did not start:"; cat "$LOG"; exit 1; }

OLD=$(grep '^PUBLIC_BASE_URL=' .env | cut -d= -f2- || true)
if [ -n "$OLD" ] || grep -q '^PUBLIC_BASE_URL=' .env; then
  sed -i.bak "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=$URL#" .env && rm -f .env.bak
else
  echo "PUBLIC_BASE_URL=$URL" >> .env
fi
echo "Public URL: $URL (saved to .env)"
[ "$OLD" != "$URL" ] && echo "The address changed: run 'npm run at:check' and update the callback URLs on Africa's Talking."

mtime() { stat -f %m .env 2>/dev/null || stat -c %Y .env; }
start_server() { node dist/main.js & SERVER=$!; }
start_server
LAST=$(mtime)
while kill -0 "$SERVER" 2>/dev/null; do
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
