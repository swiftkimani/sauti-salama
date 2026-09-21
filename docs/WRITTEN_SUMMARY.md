# Sauti Salama - written summary

**Track:** Safety, Reporting & Protection; secondary alignment with Stability & Social Cohesion.
**Author:** Benard Kimani, Nairobi, Kenya. Individual entry.
**Repository and run instructions:** https://github.com/swiftkimani/sauti-salama

## Problem and intended users

A survivor may have a phone but no safe opportunity to speak, install an app or buy mobile data. Finding a trustworthy service is only the first step: they also need to know what to do next and whether someone has accepted responsibility for helping.

Kenya's 2022 Demographic and Health Survey reports that 41% of women who have ever had a husband or intimate partner experienced economic, psychological/emotional, physical or sexual violence by their current or most recent partner. This figure includes all four categories; it is not a physical-or-sexual-violence-only statistic.

Sauti Salama is designed for survivors and people reporting on their behalf, including users of feature phones or shared phones. Its second user is a trained responder working within an accountable community organisation. The proposed value is a discreet reporting route linked to a trackable human response and source-based referral information.

## What the proof of concept demonstrates

The local simulator exercises working voice, USSD and SMS webhook flows, case storage, a responder console and an SMS outbox. The repository includes Africa's Talking sandbox setup for USSD *384*7262# and SMS 7262. These are demonstration channels, not a public emergency service. Live voice requires a provisioned number, credit and transcription; the video uses typed transcripts and rules-based triage.

The USSD danger path asks for language, the danger option and an area. Other options provide help information, reporting, callback requests, status and deletion. SMS accepts free-text reports and commands bound to the reporting phone. Voice intake builds a brief across successive turns, asks contact and police preferences, and treats repeated silence as a critical case. A silent call without a known location cannot establish where a responder should go.

Reports become a structured brief with urgency, reported location, needs and risk flags. An optional language model adds interpretation; deterministic rules preserve danger signals they detect even if the model rates them lower. This is a safety floor, not proof that every danger or language variation will be recognised. Call questions must exactly match a reviewed bilingual bank; other wording is rejected. Human responders assess the report and decide the response.

The routing engine alerts registered community responders and escalates unaccepted cases to an institutional tier. The demo uses fictional responders. A sent alert or an acknowledgement does not establish that help has arrived. Response time and referral completion need a supervised pilot.

## Information sources, trust and accuracy

The problem evidence comes from KNBS. Referral information draws on Kenya's national GBV helpline, Childline Kenya, GVRC and public health guidance. Directory records include a source and a verification flag; routing excludes unverified records and can fall back to the national helpline. Before a pilot, a safeguarding lead must confirm each service's coverage, contact details and availability, and assign a review date and owner.

Medical timing must be explicit: HIV PEP should start as soon as possible, ideally within 24 hours and no later than 72 hours after exposure. Emergency contraception may be offered within 120 hours. Care remains important after these windows; they are not deadlines for all treatment or documentation. A clinician determines appropriate care. Legal and child-protection pathways also require local professional review.

## Real-world constraints

Survivors need no mobile data or installed app; mobile network coverage is still required, and the backend needs connectivity. USSD/SMS/voice charges depend on the operator and tariff. Zero-rating is a proposed partnership, not a current entitlement. English and Kiswahili templates are implemented; Sheng interpretation and speech accuracy need evaluation with local speakers.

Accessibility shaped the channel set rather than being added to it. The call line carries a survivor who cannot read or cannot see, since nothing has to be read and no key has to be found; USSD carries a survivor who is deaf or who cannot risk being heard; SMS carries anyone who can only text. Every screen stays within one USSD page and every case reference avoids the characters that are ambiguous on a keypad or read aloud. None of this has yet been tested with survivors who have disabilities, which is a gap a pilot must close rather than a claim.

Phone numbers and narratives are encrypted at rest, contact details are masked, and revealing a number requires recorded safe-contact consent. USSD avoids sending report content into an SMS inbox, but device and operator traces can remain. No registration does not mean anonymity: the service processes the reporting phone number. Deletion removes the application case and audit records; it cannot recall delivered SMS or erase third-party logs and backups automatically. External AI processing, shared-phone risks and responder confidentiality need review before real disclosures are collected.

## Why it is worth developing further: differentiation, scalability and next step

Sauti Salama combines basic-phone access, source-based next steps, contact preferences and a measurable acknowledgement/escalation loop. It is intended to complement existing helplines and trained services. It does not claim to be Kenya's only reporting channel or to have validated faster rescue.

The proposed first pilot is with two Nairobi community networks and one institutional escalation desk; partners are not presented as secured. Start with fictional scenarios and practitioner review. Measure completion and abandonment by channel/language, false urgency classifications, time to acknowledgement, consent failures, referral completion and cost per completed referral.

Expansion to another geography requires a local operator, reviewed languages, locally valid referral rules and service contacts, telco provisioning, and safeguarding agreements. The reusable software is only part of that work. Multi-instance operation additionally needs shared session/rate-limit state and coordination of escalation workers. Hosting, messaging, voice, training and responder coverage must all be budgeted. Aggregate reporting remains future work and needs disclosure-risk controls for small communities.

## Sources

- KNBS, KDHS 2022: https://www.knbs.or.ke/reports/kdhs-2022/
- WHO, HIV post-exposure prophylaxis guidance: https://www.who.int/publications/i/item/9789240095137
- WHO, scope of post-rape care: https://www.who.int/data/gho/indicator-metadata-registry/imr-details/availability-of-post-rape-care
- Service directory and verification flags: src/resources/seed.ts

## Use of AI tools

The concept, the channel design, the community-first routing and the privacy model are the author's. Claude (Anthropic) was used as a development assistant to scaffold the NestJS backend, write unit tests and draft documentation from that design. Inside the product, an open-weight model served by Groq is the triage model, behind a rules-based safety floor, and selects call questions only from a reviewed English/Kiswahili bank. See `docs/AI_USAGE.md`.
