# Safety, privacy and compliance

This is a prototype design mapping, not a legal compliance finding. A qualified local review, service agreements and an operational safeguarding process are prerequisites for real use. Application deletion does not recall delivered SMS or automatically remove third-party recordings, logs or backups.

## 1. Threat model (who can hurt the survivor through this system)

| Threat | Mitigation in the PoC |
|---|---|
| Abuser reads the survivor's phone | USSD avoids creating an SMS report in the inbox; device/operator traces may remain; a call can be ended at any moment and the case is already open; SMS channel sends one neutral reply and nothing more unless the survivor replies YES; every SMS ends with "delete this if needed"; status/erase require the reporting phone. |
| Abuser or stranger probes the line for a survivor's case | Status, erasure, contact consent and police choice by SMS/USSD are bound to the HMAC of the reporting phone, so knowing a reference is not enough to switch on texts to a watched phone; references carry no information; the console is token-guarded (accounts and roles in production). |
| Someone silences a case (accepts or closes it so nobody comes) | `ACK` and `RESOLVE` by SMS only work from registered, active responder phones; the escalation deadline is stored with the case, so a restart or a failed alert cannot drop it. |
| Responder misuse of data | Phone numbers masked; reveal only with consent and always logged (`CONTACT_REVEALED`); narrative views logged (`ACCESSED`); responders are vetted per ward and named on every action. |
| Server compromise / database leak | Phone numbers and narratives AES-256-GCM encrypted with a key outside the database; recording URLs encrypted; no names collected; ward-level location only. |
| False or malicious reports (including to ambush a responder) | Responders travel in pairs by protocol, not alone; acknowledgement loop; rate limiting per number (reports beyond 3 an hour join the phone's existing case instead of opening new ones); patterns visible in the audit trail; a false report cannot trigger police - only a survivor's choice can. |
| AI errors | Rules floor: the model can never lower a danger signal; JSON is validated and clamped; on a call the model selects only allow-listed reviewed questions and a refused or failed question falls back to the reviewed question bank; 12-second timeout then rules. |
| Prompt injection via the report text | The prompt marks the report as untrusted data inside tags; output must be one JSON object; anything else is rejected and the rules result used. |
| Service dependency outage | No AI -> rules; no transcription -> labelled sample text (demo) / urgent case marked untranscribed (production), never invented words; no Africa's Talking -> outbox, and failed responder alerts escalate at once and retry; no Postgres -> file DB (demo only). |
| Server-side request forgery via the recording URL | Recordings are only downloaded over https from allow-listed hosts (`RECORDING_URL_HOSTS`), never from IP addresses, never following redirects, with a size cap and timeout. |

## 2. Kenya Data Protection Act 2019 mapping

| DPA principle / right | Implementation |
|---|---|
| Sensitive personal data (s.2: health, sex life) | GBV disclosures treated as sensitive: encrypted at rest, minimised, access logged. |
| Lawfulness & consent (s.30, s.32) | Reporting is the survivor's act; contact consent is asked explicitly ("is it safe to text this phone?") and defaults to no. |
| Data minimisation (s.25) | No name, no ID, no GPS; ward-level area only; AI summaries exclude identifiers by instruction and are the only thing shared with responders. |
| Storage limitation (s.25) | Closed cases purged after `RETENTION_DAYS` (90); cases never closed purged after `RETENTION_OPEN_DAYS` (365) without an update; recordings referenced, not copied; backups must not outlive the retention window (docs/RUNBOOK.md). |
| Right of access (s.26) | Survivor can check status from USSD/SMS; production: full export via the helpline desk. |
| Right to erasure (s.40) | Hard delete of the case and its audit trail from a USSD session (operator charges may apply) (option 6) or SMS `STOP`; console erase for staff. |
| Security safeguards (s.41) | AES-256-GCM, HMAC lookups, token-guarded console, audit trail, TLS in deployment. |
| Data controller registration (s.18) | The operating organisation registers with the ODPC before any live use; a DPIA (s.31) is required for a system processing sensitive data at scale - draft to be done during the pilot. |
| Cross-border transfer (s.48) | The AI provider processes the report text abroad; production requires a data-processing agreement and, where possible, a Kenya/EU-hosted model or on-premise inference. This is disclosed, not hidden. |

## 3. Sector laws the pathways follow

* **Sexual Offences Act 2006** - free medical examination and the PRC form (MOH 363); P3 form for medico-legal evidence.
* **Protection Against Domestic Violence Act 2015** - Protection Orders from any court; covers economic and emotional abuse.
* **Children Act 2022** - mandatory reporting of child abuse; Children's Officer involvement (why child cases show a required-referral flag).
* **Computer Misuse and Cybercrimes Act 2018** - online harassment and non-consensual images (legal pathway for the "harassment" type).
* **Prohibition of FGM Act 2011** - FGM risk is a protection case, not a family matter.
* **National Policy on Prevention and Response to GBV (2014)** and the **72-hour clinical window** for HIV post-exposure prophylaxis (WHO / MoH guidelines) underpin the medical steps.

## 4. Survivor-centred design rules (from GBV guiding principles: safety, confidentiality, respect, non-discrimination)

1. The survivor decides: contact, police, erasure. Each is asked or available on every channel, defaults to the most private choice, and is recorded in the audit trail.
2. Nothing is promised that cannot be kept ("we will not leave a message", "nobody will text this phone").
3. No judgement, no questions about why; the menus ask only what changes the response.
4. Children are never handled as "cases to close" - a Children's Officer is mandatory.
5. Responders are trained, vetted, and never alone on a critical case (operating protocol for the pilot).

## 5. What is deliberately NOT in this system

* No blockchain / immutable ledger (incompatible with erasure and storage limitation).
* No background location tracking, no GPS by default.
* No survivor accounts, no KYC.
* No AI-generated advice to survivors. On the call line, code accepts only exact reviewed questions from `src/i18n/call.ts`; novel model wording is rejected. Other caller-facing text uses templates, which still require practitioner validation.
* No automatic police dispatch.
