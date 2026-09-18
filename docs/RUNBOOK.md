# Operations runbook

How to deploy, run and recover Sauti Salama. The repository ships the application and its checks; backups, TLS, secrets storage and monitoring are operational work described here, not automated by the code. Nothing in this document has been exercised against a live pilot yet: rehearse each procedure before real survivors use the line.

## 1. What "production" means to the code

`NODE_ENV=production` (set by the `Dockerfile`) switches the server from demo-friendly to fail-closed. It refuses to start unless:

| Setting | Requirement |
|---|---|
| `ENCRYPTION_KEY` | 64 hex characters (`npm run keygen`) |
| `HASH_PEPPER`, `DASHBOARD_TOKEN`, `WEBHOOK_SECRET` | at least 32 random characters each, not the demo values |
| `PUBLIC_BASE_URL` | the public `https://` address Africa's Talking calls back |
| `DB_TYPE` | `postgres` (sql.js holds the whole database in memory) |
| `DB_SYNC` | not `true`: the schema comes from migrations |

It also changes behaviour:

* webhooks without `?key=<WEBHOOK_SECRET>` are refused, and the simulator's console-token shortcut is disabled;
* the simulator's typed transcripts are ignored, and a recording that cannot be transcribed becomes an urgent, untranscribed case (never sample text);
* `/api/docs` is off (set `API_DOCS=true` to enable it), and CORS is off unless `CORS_ORIGINS` is set.

## 2. First deployment

1. **Secrets.** Generate four values with `npm run keygen` (ENCRYPTION_KEY, HASH_PEPPER, DASHBOARD_TOKEN, WEBHOOK_SECRET). Keep them in a secrets manager, not in the repository or a shared chat. Store `ENCRYPTION_KEY` separately from database backups.
2. **Database.** PostgreSQL 14 or newer. The app user needs `CREATE` on the database for the first migration (it enables the `uuid-ossp` extension); afterwards ordinary read/write privileges are enough.
3. **Start.** `docker compose up -d --build` with a `.env` holding the values above (set `POSTGRES_PASSWORD` too), or run the image behind your own Postgres. Migrations run on start (`DB_MIGRATE_ON_START=false` to run them yourself with `npm run migration:run`).
4. **TLS and proxy.** Put Nginx, Traefik or Caddy in front with a real certificate. If the proxy is on another host, set `TRUST_PROXY` (for example its IP or CIDR) so rate limits see client addresses rather than the proxy's.
5. **Africa's Talking.** Configure the USSD, SMS (incoming + delivery reports) and voice callback URLs. `npm run at:check` prints them with the key filled in. Make a real test call and look at the `recordingUrl` host Africa's Talking sends; if it is not under `africastalking.com`, add it to `RECORDING_URL_HOSTS` or every recording will be treated as untranscribed.
6. **Verify.** `GET /api/health` must return `{ "ok": true }`. In the console, open *System* (or `GET /api/status` with the token) and resolve every warning you did not intend: counsellor numbers, AI and transcription providers.
7. **Responders.** The seed data is fictional. Replace it with vetted responders and their real wards before go-live, and make sure at least one active Tier-2 desk covers `*`.

## 3. Configuration added for production hardening

| Variable | Default | Purpose |
|---|---|---|
| `RECORDING_URL_HOSTS` | `africastalking.com` | Hosts (and their subdomains) recordings may be downloaded from. |
| `CALL_MAX_QUESTIONS` | 5 | How many questions the call line asks before taking consent and letting the caller go. |
| `COUNSELLOR_NUMBERS` | none | Rung first on every call; the AI answers when nobody picks up. |
| `TRANSCRIBE_TIMEOUT_MS` / `SMS_TIMEOUT_MS` | 60000 / 15000 | Outbound request timeouts. |
| `AI_MAX_CALLS_PER_MINUTE` | 60 | Ceiling on paid AI calls; above it triage uses the rules and recordings are marked untranscribed. 0 = off. |
| `API_RATE_LIMIT_PER_MINUTE` | 300 | Console API requests per client IP. |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE` | 600 | Webhook requests per source IP. Africa's Talking uses few IPs, so this is effectively a line-wide ceiling: raise it before a campaign. |
| `RATE_LIMIT_REPLIES_PER_HOUR` | 10 | SMS replies to any one unregistered number. |
| `RETENTION_OPEN_DAYS` | 365 | Never-closed cases with no update for this long are purged. 0 keeps them. |
| `DB_MIGRATE_ON_START` | `true` | Run pending migrations when the app starts. |
| `DB_SYNC` | `false` | Development only: let TypeORM change a throwaway Postgres schema. |
| `TRUST_PROXY` | `loopback` | Express `trust proxy` setting. |
| `CORS_ORIGINS` | none | Comma-separated origins allowed to call the API cross-origin. |
| `API_DOCS` | off in production | Serve Swagger UI at `/api/docs`. |

## 4. Schema changes and migrations

* Change an entity, point `DATABASE_URL` at a scratch database that is at the latest migration, then `npm run migration:generate -- src/migrations/DescribeTheChange`. Read the generated SQL: TypeORM sometimes drops and re-creates a column where a rename was meant, which loses data.
* `npm run migration:check` fails if the entities and the migrations disagree; CI runs it against PostgreSQL 16, then reverts the migrations to test `down()`.
* Roll back one migration with `npm run migration:revert` (after `npm run build`).
* **A Postgres database created before migrations existed** (the old default was `synchronize`) will make the first migration fail because the tables already exist. The PoC never held real data, so the supported path is a fresh database. If data must be kept: back up, apply the differences by hand (new columns `cases.escalateAt` and `cases.acknowledgedById`, `json` columns, the indexes and foreign keys in `src/migrations/*-InitialSchema.ts`), then record the baseline with `INSERT INTO migrations("timestamp", name) VALUES (1789659782752, 'InitialSchema1789659782752')`.

## 5. Backups and restore

Not automated by this repository. A minimal procedure:

```bash
# Nightly, from a host that can reach the database. age (https://age-encryption.org) or gpg both work.
pg_dump --format=custom "$DATABASE_URL" | age -r "$BACKUP_RECIPIENT" > "sauti-$(date +%F).dump.age"
# Keep backups no longer than RETENTION_DAYS, off the database host, and delete older files.
```

* Phone numbers and narratives are already encrypted inside the dump. The dump still holds ward, triage summaries and the audit trail, so encrypt the whole file as above.
* Never store `ENCRYPTION_KEY` next to the backups. Without the key a restore yields unreadable cases; with both, anyone holding the backup can read everything.
* **Erasure and backups:** an erased case survives in older backups until they expire. State this in the DPIA and keep the backup window no longer than `RETENTION_DAYS`.
* **Restore test (monthly):** restore the latest dump into a scratch database (`age -d ... | pg_restore --dbname "$SCRATCH_URL"`), start the app against it with the production key, and open one case in the console. At start-up the app refuses to run if the key cannot decrypt the latest cases, which is the check you want.

## 6. Keys

* **ENCRYPTION_KEY** cannot be rotated in place yet: there is no re-encryption tool. Losing it loses every narrative and phone number. Rotating it means writing that tool first.
* **HASH_PEPPER** changes break status checks, erasure and follow-up matching for existing cases (their phone hashes no longer match). Do not change it on a database with open cases.
* **DASHBOARD_TOKEN** and **WEBHOOK_SECRET** can be changed at any time. After changing `WEBHOOK_SECRET`, update every callback URL on Africa's Talking at once, or reports are refused.

## 7. The call line

The call line answers with the AI when no counsellor picks up, and it needs speech-to-text to hold a conversation
at all. Check `/api/status` after any change to those settings:

* **No transcription provider** (`GROQ_API_KEY` or `OPENAI_API_KEY` unset): a call still opens a case and alerts
  responders, but as one untranscribed urgent case, with no conversation. Treat that as an outage.
* **No AI key**: the line asks the reviewed fallback questions from `src/i18n/call.ts`. Usable, less adaptive.
* **AI budget** (`AI_MAX_CALLS_PER_MINUTE`): each turn of each call is one model call. Size it for the busiest
  expected minute: roughly (calls in progress x turns per minute) plus SMS triage.
* Every call opens a case when the phone connects, so a caller who hangs up immediately still leaves one that
  escalates. Expect some cases with no narrative; they are not a bug.
* Turn latency is 3 to 6 seconds and callers cannot interrupt. See REALTIME_VOICE.md before promising otherwise.

## 8. Monitoring

* Uptime check on `GET /api/health` (it pings the database; 503 when it cannot).
* Alert on these log lines:
  * `reached no Tier-2 desk` / audit event `ESCALATION_FAILED`: an escalation could not be delivered and is being retried every 2 minutes. Phone the Tier-2 desk.
  * `not accepted by Africa's Talking`: SMS failing (balance, sender ID, network).
  * `Could not decrypt`: corrupt data or the wrong key.
  * `Unhandled` / `failed:` from the exception filter: a bug; USSD and voice callers were shown a "try again, call 1195" message.
  * `open case(s) had no escalation deadline`: seen once after upgrading from the in-memory timer version; otherwise investigate.
* Time-to-accept is on the console footer. A rising median is the earliest sign responders are overloaded.

## 9. Incidents

| Situation | Do this |
|---|---|
| `WEBHOOK_SECRET` leaked | Generate a new one, restart, update the Africa's Talking callback URLs. Review cases created since the leak for fakes (same phone patterns, nonsense text). |
| `DASHBOARD_TOKEN` leaked | Replace it and restart. Every narrative view and number reveal is in the audit trail (`ACCESSED`, `CONTACT_REVEALED`): review the window. Report to the data controller; a breach may need ODPC notification within 72 hours (DPA s.43). |
| `ENCRYPTION_KEY` and database both exposed | Treat as a breach of sensitive personal data: ODPC notification, survivor-safety assessment with partner organisations. |
| Africa's Talking SMS down | Escalations keep retrying; Tier-2 desks must also watch the console. USSD and voice still create cases if the gateway reaches us. |
| AI provider down or over budget | Nothing to do: triage falls back to the rules and recordings become untranscribed urgent cases. Check `/api/status`. |
| Server down | USSD and voice callers get the operator's error, not our message. Restore service first; overdue escalations fire at the next start. |

## 10. Limits of a single instance

Escalation is safe to run on several instances (deadlines are claimed in the database). These are not, and need Redis or sticky sessions before scaling out: the IVR session state (language, which case the call belongs to), the per-phone rate limiters, the API/webhook throttler, the AI budget, and the SMS outbox with its delivery reports.

## 11. Dependencies

`npm audit --omit=dev` reports moderate advisories that come from NestJS 10 (`@nestjs/core`, and `file-type` through `@nestjs/common`). Patched transitive packages are pinned through `overrides` in `package.json`; CI fails on any high or critical advisory. Plan the NestJS 11 upgrade before a pilot, then remove the overrides that are no longer needed.
