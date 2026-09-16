#!/usr/bin/env node
/*
 * Checks the AI setup: the Groq key, the configured models, and one real triage of a Sheng report
 * through the same code the server uses (no case is created, nothing is sent).
 *   npm run build && npm run ai:check
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SAMPLE = 'Manze msee wangu amenichapa vibaya sana leo. Ako na kisu na anasema ataniua nikitoka. Niko Umoja, watoto wako hapa.';
let failures = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };

async function main() {
  const compiled = path.join(root, 'dist', 'ai', 'triage.service.js');
  if (!fs.existsSync(compiled)) {
    console.log('\nRun `npm run build` first (this check uses the compiled server code).\n');
    process.exitCode = 1;
    return;
  }
  const { TriageService } = require(compiled);
  const { TranscriptionService } = require(path.join(root, 'dist', 'ai', 'transcription.service.js'));
  const triage = new TriageService();
  const stt = new TranscriptionService();
  console.log(`\nAI check: triage = ${triage.provider}${triage.model ? ` (${triage.model})` : ''}, transcription = ${stt.provider}${stt.model ? ` (${stt.model})` : ''}\n`);

  if (triage.provider === 'groq' || stt.provider === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      fail('GROQ_API_KEY is empty. Create a key at https://console.groq.com/keys and paste it into .env.');
    } else {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
        if (!r.ok) {
          fail(`Groq rejected the key (${r.status}). Check GROQ_API_KEY.`);
        } else {
          const ids = ((await r.json()).data || []).map((m) => m.id);
          ok('Groq key accepted');
          for (const model of [triage.provider === 'groq' && triage.model, stt.provider === 'groq' && stt.model].filter(Boolean)) {
            if (ids.includes(model)) ok(`Model available: ${model}`);
            else fail(`Model not available on your Groq account: ${model}. Set GROQ_MODEL / GROQ_TRANSCRIBE_MODEL to one of: ${ids.slice(0, 8).join(', ')}`);
          }
        }
      } catch (e) {
        fail(`Could not reach Groq (${e.message})`);
      }
    }
  } else if (triage.provider === 'rules') {
    fail('No AI key configured: triage runs on the offline rules only. Set GROQ_API_KEY in .env.');
  }

  if (!failures && triage.provider !== 'rules') {
    console.log('\nSample triage (Sheng report, weapon, children present)');
    const started = Date.now();
    const quiet = console.warn;
    const warnings = [];
    console.warn = (...a) => warnings.push(a.join(' '));
    const r = await triage.triage({ text: SAMPLE, language: 'sw', channel: 'sms' });
    console.warn = quiet;
    const ms = Date.now() - started;
    if (r.provider === 'rules') fail(`The AI call failed and the rules answered instead (${ms} ms). Check the server log for the Groq error.`);
    else ok(`${r.provider} answered in ${ms} ms`);
    console.log(`        urgency: ${r.urgency}, immediate danger: ${r.immediate_danger}, risk flags: ${r.risk_flags.join(', ') || 'none'}`);
    console.log(`        EN: ${r.summary_en}`);
    console.log(`        SW: ${r.summary_sw}`);
    console.log(`        safety rules overrode the AI: ${(r.safety_floor || []).length ? r.safety_floor.join('; ') : 'no'}`);
  }

  console.log(failures ? `\n${failures} problem(s) to fix.\n` : '\nAI is ready.\n');
  process.exitCode = failures ? 1 : 0;
}

main();
