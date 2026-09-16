# Sprint plan - 16 to 21 September 2026

Deadline: submission form by **Sunday 21 Sep 2026**. Target: everything submitted by **Friday 19 Sep**, weekend as buffer.

## Wed 16 Sep - the system runs
- [x] Repo scaffolded: NestJS backend, voice/USSD/SMS channels, AI triage + rules floor, pathway engine, tiered notify, encrypted case store, console, simulator, tests, docs.
- [ ] `git init`, first commit, push to GitHub (public), add topics: gbv, ussd, africastalking, nestjs, hackathon.
- [ ] Run `npm test`, `npm run build && npm start`, click through simulator + console once. Fix anything you dislike in the copy (`src/i18n/messages.ts`).
- [ ] Rename if you prefer another name: grep "Sauti Salama" (docs, i18n, public).

## Thu 17 Sep - real integrations
- [ ] Groq API key -> `GROQ_API_KEY`; `npm run build && npm run ai:check`; send the five sample transcripts through `/webhooks/sms` and read the briefs in the console (check `provider: groq+rules`).
- [ ] Africa's Talking sandbox: create app, get API key; USSD channel (choose the code suffix) -> callback `https://<ngrok>/webhooks/ussd`; SMS inbound callback `https://<ngrok>/webhooks/sms`; voice: set the callback to `/webhooks/voice` and test with the sandbox simulator's phone. If sandbox voice does not work for you, the local simulator covers the video.
- [ ] `DEMO_RESPONDER_PHONE` = your number; verify an alert lands in the AT simulator inbox (sandbox) or your phone (live credits, optional).
- [ ] Confirm the numbers marked `verified: false` in `src/resources/seed.ts` (FIDA, Red Cross, KNH GBVRC) or remove them.
- [ ] Voice needs a live Africa's Talking number (the sandbox has no voice); the Groq key already enables Whisper transcription. Record the Kiswahili prompts in `docs/VOICE_PROMPTS_SW.md`.

## Fri 18 Sep - record and write
- [ ] Record the demo video from `docs/DEMO_VIDEO_SCRIPT.md` (2 takes, pick the better).
- [ ] Build the deck from `docs/PITCH_DECK.md` with real screenshots (Canva).
- [ ] Paste `docs/WRITTEN_SUMMARY.md` into the form (trim to their word limit if any).
- [ ] README: replace `<this repo>` with the real URL; add the video link and deck link at the top.
- [ ] Submit.

## Sat 19 - Sun 20 Sep - buffer
- [ ] Ask two people to run the quick start from the README on their machines; fix what breaks.
- [ ] Pre-record 6 Kiswahili prompts (main, record, info, consentYes, consentNo, goodbye) as mp3 and set `SW_AUDIO_BASE_URL` - big accessibility win if time allows.
- [ ] Re-submit if anything changed.

## Submission checklist (5 required items)
1. Working proof of concept - `npm start` + simulator (+ AT sandbox if wired).
2. GitHub repository - public, README with quick start, MIT licence.
3. Short demo video - 3 minutes, link in README.
4. Pitch deck - PDF, link in README.
5. Written summary - `docs/WRITTEN_SUMMARY.md`.

Judging criteria to keep visible while polishing: problem, intended users, how it works, why worth developing; trust & verification, low bandwidth, accessibility, privacy, multilingual, local relevance, clear next steps; idea is your own, AI tools used for development.
