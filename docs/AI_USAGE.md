# How AI tools were used (hackathon disclosure)

The hackathon allows AI development tools and requires the core idea to be the participant's own.

**The idea is mine.** Feature-phone-first, offline reporting for people the digital-first tools leave out grew out of my earlier work on an offline-first accessible SOS system (USSD/SMS/voice webhooks, tiered routing to community responders, no-blockchain privacy stance). Pivoting it to gender-based violence, adding a call line with a silent alert, survivor-controlled contact consent and erasure, and community-first routing were my design decisions.

**Claude (Anthropic) as a development assistant** - from my architecture notes and channel flows it helped:
* scaffold the NestJS module structure, TypeORM entities and Africa's Talking webhook handlers;
* draft the triage JSON contract and the rules-based keyword lists (which I reviewed and extended with Kiswahili/Sheng phrasing);
* write the unit tests, the local channel simulator, the responder console, and first drafts of the documentation which I edited.

**Claude API inside the product** - the triage model that turns a transcript or SMS into the responder brief, always behind a deterministic safety floor and never generating survivor-facing text. OpenAI Whisper is used for speech-to-text of voice recordings. Both are optional at runtime.

Everything survivor-facing (`src/i18n/messages.ts`) and every referral rule (`src/cases/referral.service.ts`) was written or reviewed by me against Kenya's GBV response standards.
