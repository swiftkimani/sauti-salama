# Security policy

Sauti Salama handles reports of gender-based violence. A security flaw here can put a survivor in physical danger, so reports are taken seriously and handled privately.

## Reporting a vulnerability

* Use GitHub's **private vulnerability reporting** on this repository (*Security > Report a vulnerability*). Please do not open a public issue, pull request or discussion.
* Include what an attacker could do, the steps to reproduce, and the commit you tested.
* You will get an acknowledgement within 5 working days and a plan or fix within 30 days. Credit is given in the fix unless you prefer otherwise.

## Rules for testing

* Test against your own local instance (`npm run dev`, the simulator) or a sandbox deployment you run. Never against a deployment that real survivors may use.
* Never submit real personal data or real reports of violence. Use the fictional samples in the simulator.
* Do not send SMS or place calls to numbers you do not own.

## Scope

In scope: this repository's code, configuration defaults, Dockerfile and CI. Especially anything that lets someone:

* read or change a case they did not report (status, consent, erasure, acknowledgement);
* learn a survivor's phone number or narrative without the audited console actions;
* make the line contact a phone the survivor marked unsafe;
* stop or delay escalation of an open case;
* fetch internal resources through the server, or send SMS/calls at our cost.

Out of scope: Africa's Talking, Groq, Anthropic and OpenAI themselves; denial of service by traffic volume; findings that require an already-leaked `ENCRYPTION_KEY`, `DASHBOARD_TOKEN` or `WEBHOOK_SECRET`.

## How the system protects data

See [docs/SAFETY_PRIVACY_COMPLIANCE.md](docs/SAFETY_PRIVACY_COMPLIANCE.md) for the threat model and [docs/RUNBOOK.md](docs/RUNBOOK.md) for keys, backups and incident response. In short: phone numbers, narratives and recording URLs are encrypted with AES-256-GCM; phone lookups use a peppered HMAC; production start-up refuses missing or default secrets; webhooks fail closed without their secret; console access to narratives and numbers is written to the audit trail.

## Supported versions

Only the `main` branch. This is a proof of concept; there are no maintained releases yet.
