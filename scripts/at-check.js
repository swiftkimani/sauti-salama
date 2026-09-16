#!/usr/bin/env node
/*
 * Checks the Africa's Talking setup end to end and prints the callback URLs to paste into the dashboard.
 *   npm run at:check                          credentials, public URL, webhook protection
 *   npm run at:check -- --sms +2547XXXXXXXX   also send a test SMS through Africa's Talking
 */
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const env = process.env;
const username = env.AT_USERNAME || 'sandbox';
const sandbox = username === 'sandbox';
const api = `https://api.${sandbox ? 'sandbox.' : ''}africastalking.com/version1`;
const publicBase = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const secret = env.WEBHOOK_SECRET || '';
const withKey = (url) => (secret ? `${url}?key=${encodeURIComponent(secret)}` : url);

let failures = 0;
const ok = (msg) => console.log(`  OK    ${msg}`);
const warn = (msg) => console.log(`  WARN  ${msg}`);
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };

async function request(url, opts = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

async function main() {
  console.log(`\nAfrica's Talking check (${sandbox ? 'sandbox' : `live account "${username}"`})\n`);

  console.log('Configuration');
  if (!env.AT_API_KEY) fail('AT_API_KEY is empty. Copy the API key from your Africa\'s Talking app into .env.');
  else ok('AT_API_KEY is set');
  if (!/^https:\/\//.test(publicBase)) fail('PUBLIC_BASE_URL must be a public https:// URL (run `npm run tunnel` and copy the trycloudflare.com address).');
  else ok(`PUBLIC_BASE_URL is ${publicBase}`);
  if (!env.DASHBOARD_TOKEN || env.DASHBOARD_TOKEN === 'demo-token') warn('DASHBOARD_TOKEN is still demo-token; anyone with the URL could open the console.');
  else ok('DASHBOARD_TOKEN is set');
  if (!secret) warn('WEBHOOK_SECRET is empty; anyone who finds the URL can post fake reports.');
  else ok('WEBHOOK_SECRET is set');
  if (!/^[0-9a-fA-F]{64}$/.test(env.ENCRYPTION_KEY || '')) warn('ENCRYPTION_KEY is not set (dev key in use). Fine for sandbox testing; set it before real survivors use the line.');
  if (!sandbox && !env.AT_SENDER_ID) warn('AT_SENDER_ID is empty; live SMS will use Africa\'s Talking\'s shared sender.');

  if (env.AT_API_KEY) {
    console.log('\nCredentials');
    try {
      const r = await request(`${api}/user?username=${encodeURIComponent(username)}`, { headers: { apiKey: env.AT_API_KEY, Accept: 'application/json' } });
      const body = await r.text();
      if (r.ok) {
        let balance = '';
        try { balance = JSON.parse(body).UserData.balance; } catch { /* not json */ }
        ok(`API key accepted for "${username}"${balance ? `, balance ${balance}` : ''}`);
      } else {
        fail(`Africa's Talking rejected the key (${r.status}: ${body.slice(0, 120).trim()}). The key must belong to the "${username}" app${sandbox ? ' (generate it inside the sandbox app)' : ''}.`);
      }
    } catch (e) {
      fail(`Could not reach ${api} (${e.message})`);
    }
  }

  if (/^https:\/\//.test(publicBase)) {
    console.log('\nPublic URL');
    try {
      const r = await request(`${publicBase}/api/health`);
      const h = await r.json();
      if (h.ok) ok(`Server reachable through the tunnel (SMS mode: ${h.sms}, AI: ${h.ai})`);
      else fail(`Health check answered but not ok: ${JSON.stringify(h)}`);
      if (h.sms === 'console') warn('The running server has no AT_API_KEY yet: restart it after editing .env.');
    } catch (e) {
      fail(`${publicBase}/api/health is not reachable (${e.message}). Is the server running and the tunnel open?`);
    }
    try {
      const form = new URLSearchParams({ sessionId: 'at-check', serviceCode: '*384#', phoneNumber: '+254700000001', text: '' });
      const withoutKey = await request(`${publicBase}/webhooks/ussd`, { method: 'POST', body: form });
      if (secret) {
        if (withoutKey.status === 401) ok('Webhooks refuse calls without the key');
        else fail(`Webhooks accepted a call without the key (${withoutKey.status}). Restart the server so it picks up WEBHOOK_SECRET.`);
      }
      const withKeyRes = await request(withKey(`${publicBase}/webhooks/ussd`), { method: 'POST', body: form });
      const text = await withKeyRes.text();
      if (withKeyRes.ok && text.startsWith('CON')) ok('USSD webhook answers correctly with the key');
      else fail(`USSD webhook did not answer as expected (${withKeyRes.status}: ${text.slice(0, 80)})`);
    } catch (e) {
      fail(`Webhook test failed (${e.message})`);
    }
  }

  const smsTo = process.argv.includes('--sms') ? process.argv[process.argv.indexOf('--sms') + 1] : null;
  if (smsTo && env.AT_API_KEY) {
    console.log('\nTest SMS');
    const body = new URLSearchParams({ username, to: smsTo, message: 'Sauti Salama: test message from npm run at:check.' });
    if (env.AT_SENDER_ID) body.set('from', env.AT_SENDER_ID);
    try {
      const r = await request(`${api}/messaging`, { method: 'POST', headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await r.json().catch(() => ({}));
      const rec = data?.SMSMessageData?.Recipients?.[0];
      if (rec && [100, 101, 102].includes(Number(rec.statusCode))) ok(`Accepted for ${rec.number} (${rec.status}, cost ${rec.cost})${sandbox ? '. Open the sandbox simulator with this number to see it.' : ''}`);
      else fail(`Not accepted: ${rec?.status || data?.SMSMessageData?.Message || r.status}`);
    } catch (e) {
      fail(`Could not send (${e.message})`);
    }
  }

  const base = publicBase || `http://localhost:${env.PORT || 3000}`;
  console.log('\nCallback URLs for the Africa\'s Talking dashboard');
  console.log(`  USSD                 ${withKey(`${base}/webhooks/ussd`)}`);
  console.log(`  SMS incoming         ${withKey(`${base}/webhooks/sms`)}`);
  console.log(`  SMS delivery reports ${withKey(`${base}/webhooks/sms/delivery`)}`);
  console.log(`  Voice                ${withKey(`${base}/webhooks/voice`)}`);
  console.log(failures ? `\n${failures} problem(s) to fix.\n` : '\nAll checks passed.\n');
  process.exitCode = failures ? 1 : 0;
}

main();
