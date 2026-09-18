# Sauti Salama - "Safe Voice"

**An offline-first, AI-assisted gender-based violence (GBV) reporting and referral line for Kenya.**
Any phone. No internet. No app. A survivor can call, dial a USSD code or send one SMS and, within seconds, a vetted community responder is alerted, the survivor gets the right next step (the 72-hour medical window, a Protection Order, Childline 116), and nothing about them is stored unencrypted.

Built by [Benard Kimani](https://benardkimani.co.ke) as a solo entry to the **OSF x Andela Hackathon 2026** - track *Safety, Reporting & Protection* (cross-track with *Stability & Social Cohesion*).

> This is an invention-sprint proof of concept, not a live service. If you are in danger in Kenya call **999 / 112**. The national GBV helpline is **1195** (free, 24/7). Childline is **116**.

---

## The problem, in numbers

* Over 40% of Kenyan women aged 15-49 who have ever had a partner have experienced physical or sexual intimate-partner violence; 34% of all women have experienced physical violence since age 15 and 13-14% sexual violence (KDHS 2022, KNBS).
* Most never seek formal help. The barriers are practical: the abuser controls the phone, the household and the money; reporting requires airtime, data or a trip to a station; the survivor does not know that post-rape care is free and only works within 72 hours; and the first official contact is often not survivor-centred.
* Roughly one in three mobile devices in Kenya is still a feature phone (Communications Authority of Kenya sector statistics - confirm the latest quarter before quoting); every existing GBV app assumes a smartphone and a data bundle.

## The solution

Sauti Salama is a **backend**, not an app. It sits behind three channels every phone in Kenya already has:

| Channel | For whom | What happens |
|---|---|---|
| **Call line** | anyone who can speak: low literacy, visually impaired, panicked | No menu. The line answers, listens and asks one question at a time, like an emergency call: what is happening, where you are, who is with you. Responders are alerted from the first sentence, not at the end of the call. A caller who says nothing becomes a silent, critical alert. |
| **USSD** `*384*7262#` | anyone who cannot speak: abuser in the next room, deaf survivors | Silent, no data, no trace in the call log or inbox. Structured report in 6 answers (the last: does the survivor want help reporting to the police, default no), or **"I am in danger NOW"** in 2. Also: verified help information, call-back request, case status, delete-my-report. |
| **SMS** | anyone who can only text | Free text in English, Kiswahili or Sheng -> AI triage -> responder alerted -> one neutral reply. `HELP`/`MSAADA` returns vetted information; `POLICE YES`/`POLISI HAPANA` records the survivor's choice about police; `STOP` erases. Survivor commands only act on cases reported from the same phone; `ACK`/`RESOLVE` only work from registered responder phones. |

Behind the channels:

1. **AI triage and intake** (open-weight `gpt-oss-120b` on Groq, strict JSON-schema output): on a call the model listens and chooses the next question; from any channel the report becomes a structured, bilingual responder brief - violence type, urgency, immediate danger, hours since the incident, perpetrator relationship, child survivor, risk flags (weapon, strangulation, children present), needs. A **rules-based floor** runs first and always: the AI can raise urgency, never lower a danger signal, the console shows exactly where the rules overrode the AI, and the line keeps working with no AI key at all. Call recordings are transcribed by Whisper large v3 on Groq.
2. **Referral pathway engine**: deterministic rules produce ordered next steps with deadlines and the verified service for each (72h PEP / 120h emergency contraception and the PRC form MOH 363; P3 form and Gender Desks; Protection Orders under PADVA 2015; FIDA Kenya legal aid; Childline 116 and mandatory child-protection referral; shelter via 1195/GVRC).
3. **Tiered, community-first routing**: Tier 1 = vetted community responders for the survivor's ward (community health promoters, peace-committee members, trained volunteers). If nobody acknowledges within N minutes (the deadline is stored with the case, so it survives restarts, and a failed alert is retried), Tier 2 = institutional desk. Police involvement is the survivor's choice, asked on every channel, never the default.
4. **Survivor-controlled privacy**: no registration, no ID. Phone numbers and narratives are AES-256-GCM encrypted; the console shows masked numbers; a responder can reveal a number only if the survivor said the phone is safe, and every reveal is logged. The survivor can check status or **erase everything** from the same USSD menu.
5. **Two-way "pull"**: the USSD menus and the call line return verified information (what is free, what the deadlines are, who to call) - trusted civic information people can act on, which is the hackathon's core theme.

## Quick start (2 minutes, no accounts needed)

```bash
git clone <this repo> && cd sauti-salama
npm install
cp .env.example .env          # optional; defaults work
npm run build && npm start    # or: npm run dev
```

Open:

* **Channel simulator** - http://localhost:3000/simulator.html - a feature-phone USSD emulator, a call-line screen with keypad and recorded-report entry, an SMS chat, and the outbox that shows exactly what responders and survivors receive. It posts the same payloads Africa's Talking sends, so the demo does not depend on any third party.
* **Responder console** - http://localhost:3000/dashboard.html?token=demo-token - cases by urgency, AI brief in English and Kiswahili, next-step checklist, consent flags, audit timeline, accept / resolve / reveal / erase.

**Demo video** (real screens, no mock-ups): [narrated, 2:56](docs/demo/sauti-salama-demo-vo.mp4) in a Kenyan English voice, or [silent with captions, 2:11](docs/demo/sauti-salama-demo.mp4). How it is built, and how to put your own voice on it: [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md).

`npm run demo` runs the golden path from the terminal. `npm test` runs the unit and integration tests (triage, pathways, escalation, channels, HTTP), `npm run lint` the linter. API reference: http://localhost:3000/api/docs (or [docs/openapi.json](docs/openapi.json)). Contributing rules: [CONTRIBUTING.md](CONTRIBUTING.md); deploying and operating: [docs/RUNBOOK.md](docs/RUNBOOK.md); reporting a vulnerability: [SECURITY.md](SECURITY.md).

### Turning on the real integrations

| What | Env | Notes |
|---|---|---|
| AI triage and call transcription | `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TRANSCRIBE_MODEL` | One free key from [console.groq.com/keys](https://console.groq.com/keys) powers both. `npm run build && npm run ai:check` verifies the key and runs a sample Sheng report through triage. Without a key the rules-based triage runs alone and the simulator's typed transcript is used. `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` is also supported. |
| Call line conversation | `GROQ_API_KEY`, `CALL_MAX_QUESTIONS` | Speech-to-text is what lets the line hold a conversation: without it a call becomes one untranscribed urgent case. The model asks its own questions; without a key the reviewed fallback questions are used. |
| Counsellor transfer | `COUNSELLOR_NUMBERS` | Numbers voice option 3 connects to. Empty: the call logs a call-back request. |
| Abuse protection | `RATE_LIMIT_REPORTS_PER_HOUR`, `RATE_LIMIT_INFO_PER_HOUR`, `RATE_LIMIT_REPLIES_PER_HOUR`, `API_RATE_LIMIT_PER_MINUTE`, `WEBHOOK_RATE_LIMIT_PER_MINUTE`, `AI_MAX_CALLS_PER_MINUTE` | Beyond 3 new cases an hour, further reports from a phone are added to its latest case (never dropped). Over the AI ceiling, triage falls back to the rules. |
| Africa's Talking | `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`, `PUBLIC_BASE_URL`, `WEBHOOK_SECRET` | See [Connecting Africa's Talking](#connecting-africas-talking) below. |
| Your phone as the responder | `DEMO_RESPONDER_PHONE` | Every Tier-1 alert goes here. |
| Production database | `DB_TYPE=postgres`, `DATABASE_URL` | Schema from migrations (`npm run migration:run`, also applied on start). `docker compose up` starts Postgres + the app. Default is a zero-setup `sql.js` file DB. |
| Encryption | `ENCRYPTION_KEY` (`npm run keygen`), `HASH_PEPPER` | A dev key is used (with a warning) if unset. With `NODE_ENV=production` the server refuses to start without them. |
| Production mode | `NODE_ENV=production` | Refuses to start without real secrets, an https `PUBLIC_BASE_URL` and Postgres; webhooks fail closed; no sample transcripts. See [docs/RUNBOOK.md](docs/RUNBOOK.md). |

## Connecting Africa's Talking

SMS and USSD work in the free **sandbox**. Voice is not available in the sandbox: it needs a live account, a voice number from Africa's Talking and airtime credit.

1. **Secure the server before it goes public.** In `.env` set a long `DASHBOARD_TOKEN` and a `WEBHOOK_SECRET` (`npm run keygen` prints one). Callbacks without `?key=<WEBHOOK_SECRET>` are refused.
2. **Run the server on a public HTTPS URL.** `npm run live` (needs `brew install cloudflared`, no account) builds the server, opens a free tunnel, saves its `https://....trycloudflare.com` address to `PUBLIC_BASE_URL` and starts the server. Keep that terminal open; Ctrl+C stops both. A quick tunnel gets a new address every time it starts, so update the dashboard callback URLs when it changes; use a named tunnel or a deployment for anything longer-lived.
3. **Get an API key.** Sign in at [account.africastalking.com](https://account.africastalking.com), open the **sandbox** app, go to *Settings > API Key*, generate a key and paste it into `AT_API_KEY` (keep `AT_USERNAME=sandbox`). Do this before `npm run live` so you don't have to restart it (and get a new address) afterwards.
4. **Check everything:** `npm run at:check`. It verifies the key, the tunnel and the webhook protection, and prints the exact callback URLs (with the key) to use next. The server's own start-up output shows `?key=<WEBHOOK_SECRET>` instead of the secret, so it never lands in logs.
5. **Configure the sandbox app** with those URLs:
   * *USSD > Create channel*: pick a code such as `*384*XXXX#`, callback = the USSD URL.
   * *SMS > Shortcodes > Create*: pick a shortcode, then *SMS > SMS Callback URLs*: *Incoming messages* = the SMS incoming URL, *Delivery reports* = the delivery URL. Set `AT_SENDER_ID` to the shortcode so replies thread with the survivor's messages.
6. **Test with the Africa's Talking simulator** ([simulator.africastalking.com](https://simulator.africastalking.com)): enter a phone number, dial your USSD code or text your shortcode. Cases appear in the console. In the sandbox, SMS is only delivered to numbers open in the simulator, so set `DEMO_RESPONDER_PHONE` to a second simulator number to watch responder alerts arrive.

**Going live** means a production app username and key, a dedicated or shared USSD code and an SMS shortcode or sender ID approved through Africa's Talking (telco approval takes time and has setup costs), a voice number for the call line, a permanent HTTPS deployment instead of a quick tunnel, `NODE_ENV=production` with real secrets on a fresh PostgreSQL database, and the checklist in [docs/RUNBOOK.md](docs/RUNBOOK.md) (including confirming the recording host for `RECORDING_URL_HOSTS`).

## How it works

```mermaid
flowchart LR
  subgraph phones[Any phone in Kenya]
    V[Voice call]:::ch
    U[USSD *384*7262#]:::ch
    S[SMS]:::ch
  end
  AT[Africa's Talking<br/>Voice / USSD / SMS gateway]
  V --> AT --> API
  U --> AT
  S --> AT
  subgraph API[Sauti Salama backend - NestJS]
    IVR[Call line<br/>listen, ask, decide]
    USSD[USSD flow]
    SMSin[SMS keywords]
    TR[Transcription<br/>Whisper on Groq]
    AI[AI triage<br/>Groq LLM + rules floor]
    RP[Referral pathway engine]
    NT[Tiered notify + stored escalation deadline]
    DB[(Encrypted case store<br/>sql.js / PostgreSQL)]
    DIR[(Verified support directory)]
  end
  IVR --> TR --> AI
  USSD --> AI
  SMSin --> AI
  AI --> RP --> NT
  RP --- DIR
  AI --> DB
  NT -->|SMS alert| T1[Tier 1: community responders]
  NT -->|no ACK in N min| T2[Tier 2: GBV Recovery Centre desk]
  T1 -->|ACK / RESOLVE| SMSin
  DB --> C[Responder console]
  classDef ch fill:#EFE7F6,stroke:#5B2A86;
```

Full diagrams, sequence flows and the data model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository map

```
src/
  channels/voice   call line: greet, listen, ask, consent, closing (Africa's Talking call-action XML)
  ai/conversation* the call brain: what the responder still needs, what to ask next, when to stop
  channels/ussd    USSD state machine (report / danger now / info / call back / status / delete)
  channels/sms     inbound keywords (ACK, RESOLVE, HELP, YES, POLICE, STOP) + free-text reports
  ai/              triage prompt + JSON schema (Groq or Claude), rules-based floor, transcription, place gazetteer
  cases/           case service, referral pathway engine, tiered notify + escalation, audit events, retention purge
  resources/       verified support directory (seeded)
  responders/      vetted responder registry (seeded with demo data)
  i18n/            every survivor-facing string, English + Kiswahili
  common/          AES-256-GCM crypto, phone masking, reference codes, SMS outbox, exception filter
  config/          database + migrations setup, production start-up checks, OpenAPI
  migrations/      PostgreSQL schema migrations
public/            simulator.html, dashboard.html
docs/              architecture, runbook, OpenAPI spec, written summary, pitch deck (PDF + HTML source), demo script, compliance, Kiswahili voice prompts, AI usage
test/              unit tests (triage, pathways, crypto, guards, transcription) and integration tests (escalation, cases, channels, HTTP)
```

## Design decisions worth knowing

* **AI structures, humans decide, survivors get vetted text.** The model only ever produces the responder brief. Every word a survivor sees or hears is a reviewed template (`src/i18n/messages.ts`). No hallucinated advice can reach a survivor.
* **Silence is a feature.** USSD leaves no trace; a caller who cannot speak is treated as an emergency rather than asked again and again; the SMS channel sends exactly one neutral reply until the survivor says the phone is safe.
* **No registration.** Anonymity is the difference between a report and no report. Abuse of the line is handled by per-number rate limiting (extra reports join the phone's existing case, so a real emergency is never dropped), responder vetting and the acknowledgement loop, not by ID checks.
* **No blockchain, on purpose.** GBV disclosures are sensitive personal data under the Kenya Data Protection Act 2019; the right to erasure and storage limitation are incompatible with an immutable ledger. Erasure here is a real hard delete you can trigger from a KSh 0 USSD session.
* **Degrades gracefully, never by inventing.** No AI key -> rules triage. No transcription key -> labelled sample text in the demo; in production the report becomes an urgent case marked untranscribed. No Africa's Talking key -> console outbox. No Postgres -> file database. The demo cannot be broken by a third party being down.

## Roadmap after the sprint

1. Pilot with two community responder networks in Nairobi (e.g. Kayole and Kibra) and one GBV Recovery Centre as Tier 2; measure time-to-acknowledge.
2. A real-time voice agent so callers can interrupt and be answered in under a second, with a Kiswahili voice that sounds Kenyan ([docs/REALTIME_VOICE.md](docs/REALTIME_VOICE.md)), then Dholuo, Gikuyu, Somali, Kalenjin.
3. Responder accounts and roles, telco zero-rating of the USSD code, WhatsApp channel.
4. Location without GPS: ward-level lookup from the survivor's typed area, later telco cell-site LBS under a data-sharing agreement.
5. Anonymised, aggregated incident reporting for county GBV working groups (ward-level heat maps, never case-level).

## AI tools in this project

The core idea - an offline-first, feature-phone-first GBV line with community-first routing and survivor-controlled privacy - is the author's. Claude (Anthropic) was used as a coding assistant to scaffold the NestJS modules, write tests and draft documentation from the author's design; Claude's API is used inside the product for triage. Details: [docs/AI_USAGE.md](docs/AI_USAGE.md).

## Licence

MIT. Support-directory numbers marked `verified: false` in `src/resources/seed.ts` must be confirmed before any real use.
