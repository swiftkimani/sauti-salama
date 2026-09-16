# Sauti Salama - written summary (submission)

**Track:** Safety, Reporting & Protection (cross-track: Stability & Social Cohesion)
**Author:** Benard Kimani, Nairobi - solo entry
**Proof of concept:** voice call line, USSD and SMS reporting channels with AI triage, a referral pathway engine, tiered community-first routing, a responder console and a full local simulator. Repository, demo video and pitch deck attached.

## The problem

Gender-based violence is the most common violent crime in Kenya and the least reported. KDHS 2022 found that over 40% of ever-partnered women aged 15-49 have experienced physical or sexual violence from a partner, 34% of all women have experienced physical violence since age 15, and 13-14% sexual violence. Most survivors never reach a service. The reasons are practical, not attitudinal: the abuser often controls the phone, the house and the money; reporting requires airtime, a data bundle or a trip to a station; the survivor does not know that post-rape care is free and time-critical (HIV prevention only works within 72 hours); and the first official contact is often not survivor-centred. Every GBV app on the market assumes a smartphone, a data bundle and a private moment - the three things a survivor is least likely to have.

## Who it is for

Survivors and the people who report for them - a neighbour, a sister, a teacher - on whatever phone they hold: a feature phone with no data, a shared smartphone, a phone the abuser checks. It is designed for people who cannot speak (abuser in the next room, deaf survivors), cannot read well (voice line), or only have seconds (two key presses for "I am in danger NOW"). The second user is the community responder: the community health promoter, peace-committee member or trained volunteer who can reach a survivor in minutes, before any institution can.

## How it works

Sauti Salama is a backend behind three channels every Kenyan phone already has: a **call line** (interactive voice menu in English and Kiswahili, with a recorded report, a spoken reference number, and "press 9" for a silent alert), a **USSD code** (silent, free on most networks, leaves no trace; a structured report in five key presses, or "I am in danger NOW" in two; plus verified help information, call-back request, case status and delete-my-report), and an **SMS shortcode** (free text in English, Kiswahili or Sheng; HELP for information; STOP to erase).

Every report is turned into a structured, bilingual responder brief by **AI triage**: violence type, urgency, immediate danger, hours since the incident (the 72-hour window), perpetrator relationship, child survivor, and risk flags such as weapons, strangulation or children present. A deterministic **rules floor** runs first and always: the AI can raise urgency and add detail but can never lower a danger signal, and the whole line keeps working if the AI is unavailable. A **referral engine** then produces ordered next steps with deadlines and the verified service for each - post-rape care and the PRC form within 72/120 hours, the P3 form and Gender Desk, Protection Orders under the Protection Against Domestic Violence Act 2015, FIDA Kenya legal aid, Childline 116 and mandatory child-protection referral, shelter through 1195. **Tiered routing** alerts vetted Tier-1 community responders for the survivor's ward by SMS; if nobody acknowledges within a set time the case escalates to a Tier-2 institutional desk. Police involvement is the survivor's choice, never the default. The survivor gets a reference number, the one or two most important next steps in their language, and is asked whether this phone is safe to contact; nothing else is ever sent to that phone without a yes.

## Real-world conditions

* **Trust and verification.** Responders are a vouched circle registered per ward with the organisation that verified them; every alert carries a reference the survivor can quote; the acknowledgement loop and escalation timer make every case someone's responsibility within minutes; the survivor can check who accepted their case from a USSD menu. No registration or ID is required from survivors because anonymity is the difference between a report and no report; abuse of the line is handled with rate limiting and responder vetting, not identity checks.
* **Low bandwidth.** Zero data. Voice, USSD and SMS only. The responder console is the only web surface and it is for staff.
* **Accessibility.** Voice for low literacy and visual impairment; USSD for deaf survivors and anyone who cannot speak; every screen under 160 characters; every reference readable aloud without ambiguous characters.
* **Privacy.** Phone numbers and narratives are encrypted at rest (AES-256-GCM); the console shows masked numbers; a number can be revealed only with the survivor's consent and every reveal is logged; closed cases are purged after 90 days; the survivor can erase everything from a free USSD session. Location is kept at ward level, never GPS by default. This maps directly to the Kenya Data Protection Act 2019 (sensitive personal data, data minimisation, storage limitation, right to erasure) - which is also why there is deliberately no blockchain.
* **Multilingual.** English and Kiswahili on every channel; Sheng and code-switching handled by the triage model and the rules floor; pre-recorded Kiswahili prompts drop in for the voice line.
* **Local relevance.** Built on Africa's Talking, the gateway Kenyan telcos already expose; the support directory is Kenya's real services (1195, 116, 1190, GVRC, FIDA); the pathways follow Kenya's own forms and laws.
* **Clear next steps.** The survivor never leaves a session without a reference, the most important deadline, and a free number to call.

## Why it is worth developing further

It changes who responds first. Today the only national entry point is a phone call to a helpline; Sauti Salama adds silent and text entry points and puts a vetted neighbour, not a distant institution, at the other end - which is exactly the shift of power to communities that OSF's Transformative Peace in Africa initiative describes. It is cheap to run (USSD sessions and SMS cost cents; the AI costs fractions of a cent per report), it needs no new hardware in anyone's hands, and the county GBV working groups get, for the first time, anonymised ward-level data on where and when violence happens. The next step is a supervised pilot with two community responder networks in Nairobi and one GBV Recovery Centre as the escalation desk, measuring time-to-acknowledge and survivor-reported outcomes.

## Use of AI tools

The concept, the channel design, the community-first routing and the privacy model are the author's. Claude (Anthropic) was used as a development assistant to scaffold the NestJS backend, write unit tests and draft documentation from that design; Claude's API is also the triage model inside the product, behind a rules-based safety floor. See `docs/AI_USAGE.md`.
