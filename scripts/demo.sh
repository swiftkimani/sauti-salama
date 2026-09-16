#!/usr/bin/env bash
# Golden-path smoke demo against a running server (default http://localhost:3000).
# Shows: USSD report -> responder alert -> survivor SMS (consented) -> responder ACK -> status check -> erasure.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
TOKEN="${DASHBOARD_TOKEN:-$(grep -s '^DASHBOARD_TOKEN=' .env | cut -d= -f2-)}"
TOKEN="${TOKEN:-demo-token}"
PHONE="+254712345678"
H="x-dashboard-token: $TOKEN"  # lets the script through when WEBHOOK_SECRET is set
u() { curl -s -X POST "$BASE/webhooks/ussd" -H "$H" -d "sessionId=demo&serviceCode=*384*7262%23&phoneNumber=$PHONE&text=$1"; echo; echo; }

echo "== 1. Survivor dials *384*7262# (Kiswahili, sexual violence today, abuser not present, area Kayole, SMS safe)"
u ""; u "2"; u "2*1"; u "2*1*2"; u "2*1*2*1"; u "2*1*2*1*2"; u "2*1*2*1*2*Kayole"
LAST=$(u "2*1*2*1*2*Kayole*1"); echo "$LAST"
REF=$(echo "$LAST" | grep -o 'SS-[A-Z2-9]\{4\}' | head -1)

echo "== 2. What went out (responder alert + survivor next steps)"
curl -s "$BASE/api/outbox?token=$TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const m of JSON.parse(s).slice(0,2))console.log('['+m.kind+' -> '+m.to+']\n'+m.message+'\n')})"

echo "== 3. Responder replies ACK by SMS"
curl -s -X POST "$BASE/webhooks/sms" -H "$H" -d "from=%2B254700000000&to=7262&text=ACK $REF&id=demo1"; echo
sleep 1  # inbound SMS is processed in the background

echo "== 4. Survivor checks status by USSD (option 5)"
u "2*5*$REF"

echo "== 5. A stranger cannot read that status"
curl -s -X POST "$BASE/webhooks/ussd" -H "$H" -d "sessionId=x&phoneNumber=%2B254799999999&text=2*5*$REF"; echo; echo

echo "== 6. Survivor erases the report (option 6) - right to be forgotten"
u "2*6*$REF"
echo "Console: $BASE/dashboard.html?token=$TOKEN"
