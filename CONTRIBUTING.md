# Contributing

Thank you for helping. This is a safety-critical service for survivors of gender-based violence: a small change to wording, logging or routing can put someone at risk. Please read the rules below before opening a pull request.

## Set up

```bash
npm install
cp .env.example .env     # optional; the defaults run fully offline
npm run dev              # http://localhost:3000/simulator.html and /dashboard.html?token=demo-token
```

No accounts or keys are needed. Without `AT_API_KEY` no SMS leaves your machine; without AI keys the rules-based triage runs.

## Checks (CI runs all of them)

| Command | What it does |
|---|---|
| `npm run lint` | ESLint (TypeScript) |
| `npm run build` | Type-check and compile |
| `npm test` / `npm run test:cov` | Unit and integration tests on an in-memory database; coverage thresholds are enforced |
| `npm run migration:check` | With `DATABASE_URL` pointing at a migrated PostgreSQL: fails if the entities and migrations disagree |
| `npm run openapi` | Regenerates `docs/openapi.json` after you change an endpoint or DTO |

Tests never read `.env` and clear AI and SMS keys first, so a test run cannot send a real message or spend credit.

## Rules that are not negotiable

1. **Survivor-facing text** lives only in `src/i18n/messages.ts` and `src/i18n/call.ts`, in English and Kiswahili. The one exception is the call line, where the model writes its own questions: it may never state a fact, a number, a deadline or a promise, generated text containing digits is refused (`validateQuestion`), and a refused question falls back to the reviewed bank. A change to a Kiswahili string needs review by a fluent speaker, and a changed voice prompt must be re-recorded (`docs/VOICE_PROMPTS_SW.md`). Keep USSD screens under about 160 characters.
2. **No personal data in logs.** Never log a full phone number (use `maskPhone`), a message body, a narrative, a transcript or a secret.
3. **Identifying data is encrypted.** New fields that could identify a survivor go through `CryptoService.encrypt`, and reading them in the console is an audited action (`CaseEventsService.add`).
4. **Survivor commands act only on the reporting phone.** Anything that reads, changes consent on, or erases a case from USSD/SMS must check the phone hash.
5. **Never lower danger.** The rules floor in `src/ai/rules.ts` may only be raised by the AI. Add a test when you touch triage.
6. **Fail safe.** When something fails (AI, transcription, SMS, decryption), the report must still reach a responder and the survivor must never be sent invented or unsafe content. Escalation must never depend on a send succeeding.
7. **Schema changes need a migration** (`npm run migration:generate -- src/migrations/Name`, see `docs/RUNBOOK.md`).

## Pull requests

* One topic per pull request, with tests for behaviour changes.
* Describe the safety and privacy impact, even if it is "none".
* Commit messages: an imperative summary line, then the why.
* Security issues: do not open a pull request; follow [SECURITY.md](SECURITY.md).
