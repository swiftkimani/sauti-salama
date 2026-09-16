# Architecture

## 1. Context

```mermaid
flowchart TB
  S((Survivor<br/>any phone)) -->|call / USSD / SMS| GW[Africa's Talking gateway]
  R((Community responder<br/>any phone)) -->|ACK / RESOLVE by SMS| GW
  GW -->|webhooks| B[Sauti Salama backend]
  B -->|SMS alerts| GW --> R
  B -->|SMS next steps<br/>only with consent| GW --> S
  B --> AI[Claude API<br/>triage]
  B --> STT[Whisper<br/>speech to text]
  D[Duty desk / GBV Recovery Centre] -->|console| B
```

Everything survivor-facing is delivered by the telco network (voice, USSD, SMS). The backend never needs the survivor to have data, an app or an account.

## 2. Components

| Component | Responsibility | Code |
|---|---|---|
| Voice IVR | Language menu, main menu, record report, urgent info, counsellor transfer / call-back, silent alert (9), consent | `src/channels/voice` |
| USSD | `*384*7262#` state machine: report, danger now, info, call back, status, delete | `src/channels/ussd` |
| SMS | Inbound keywords for survivors (HELP, YES, STOP) and responders (ACK, RESOLVE); free-text reports | `src/channels/sms` |
| Transcription | Recording URL -> text (Whisper), mock in the simulator | `src/ai/transcription.service.ts` |
| Triage | Rules floor + Claude JSON brief, validated and merged | `src/ai/rules.ts`, `src/ai/triage.service.ts`, `src/ai/prompts.ts` |
| Referral engine | Triage -> ordered bilingual next steps + verified service per step | `src/cases/referral.service.ts` |
| Notify | Tier-1 SMS to ward responders, escalation timer to Tier 2, survivor SMS only with consent | `src/cases/notify.service.ts` |
| Case store | Encrypted case, audit events, retention purge, erasure | `src/cases/*`, `src/entities/*` |
| Directory | Verified support services, seeded | `src/resources` |
| Console | Responder view, audited actions | `public/dashboard.html`, `src/api` |
| Simulator | Reproduces Africa's Talking payloads locally | `public/simulator.html` |

## 3. Sequences

### 3.1 Voice: recorded report

```mermaid
sequenceDiagram
  participant S as Survivor
  participant AT as Africa's Talking
  participant B as Backend
  participant W as Whisper
  participant C as Claude
  participant R as Tier-1 responder
  S->>AT: calls the line
  AT->>B: POST /webhooks/voice (isActive=1)
  B-->>AT: GetDigits: "For English press 1, Kiswahili 2"
  AT->>B: POST /voice/lang (dtmfDigits)
  B-->>AT: GetDigits: main menu
  AT->>B: POST /voice/menu (1)
  B-->>AT: Record: "After the beep, tell us what happened..."
  AT->>B: POST /voice/recording (recordingUrl)
  B->>B: create case PROCESSING, reference SS-XXXX
  B-->>AT: GetDigits: "Your reference is S S dash ... Is it safe to call this phone? 1/2"
  par background
    B->>W: transcribe(recordingUrl)
    W-->>B: text
    B->>C: triage(text) with rules floor
    C-->>B: JSON brief
    B->>B: pathway, status OPEN, audit events
    B->>R: SMS alert (masked, no phone number)
    B->>B: start escalation timer
  end
  AT->>B: POST /voice/consent (1 or 2)
  B-->>AT: Say closing message
  R->>B: SMS "ACK SS-XXXX"
  B->>B: ACKNOWLEDGED, timer cancelled
  B-->>S: SMS "responder accepted" (only if consented)
```

### 3.2 USSD: "I am in danger NOW"

```mermaid
sequenceDiagram
  participant S as Survivor
  participant AT as Africa's Talking
  participant B as Backend
  participant R as Responder
  S->>AT: *384*7262#
  AT->>B: text=""
  B-->>AT: CON language menu
  S->>AT: 1
  B-->>AT: CON main menu
  S->>AT: 2 ("I am in danger NOW")
  B-->>AT: CON "Type your area, or 0 to skip"
  S->>AT: Dandora
  B->>B: silent triage: critical, immediate danger
  B->>R: SMS ALERT [CRITICAL] SS-XXXX ... Area: Dandora
  B-->>AT: END "Alert sent (SS-XXXX). Move to a safe place. 999/112."
```

Three key presses and a word. No data, no airtime on most networks, nothing left on the phone.

### 3.3 SMS: free-text report

```mermaid
sequenceDiagram
  participant S as Survivor
  participant B as Backend
  participant R as Responder
  S->>B: "Naomba msaada, jana usiku nilibakwa na jirani hapa Kibra..."
  B->>B: rules floor (sexual, 30h, Kibra, acquaintance) + Claude brief
  B->>R: ALERT [HIGH] ... Next: health facility within 72h (PEP)
  B-->>S: one neutral reply with reference; "Reply YES if it is safe to text this number"
  S->>B: YES
  B-->>S: next steps in Kiswahili (72h PEP, PRC form, 1195)
```

## 4. Case lifecycle

```mermaid
stateDiagram-v2
  [*] --> PROCESSING: voice recording received
  [*] --> OPEN: USSD / SMS / silent alert
  PROCESSING --> OPEN: transcribed + triaged
  OPEN --> ACKNOWLEDGED: responder ACK (SMS or console)
  OPEN --> ESCALATED: no ACK within ESCALATION_MINUTES
  ESCALATED --> ACKNOWLEDGED: Tier-2 or Tier-1 ACK
  ACKNOWLEDGED --> RESOLVED: survivor confirmed safe
  ACKNOWLEDGED --> FALSE_ALARM
  OPEN --> FALSE_ALARM
  RESOLVED --> [*]: purged after RETENTION_DAYS
  FALSE_ALARM --> [*]: purged after RETENTION_DAYS
  OPEN --> [*]: survivor erases (USSD 6 / SMS STOP)
  ACKNOWLEDGED --> [*]: survivor erases
```

## 5. Data model

```mermaid
erDiagram
  CASE {
    uuid id
    string ref "SS-XXXX, spoken/typed reference"
    string channel "voice | voice_silent | ussd | ussd_silent | sms"
    string language "en | sw"
    text phoneEnc "AES-256-GCM"
    string phoneHash "HMAC, for lookups only"
    string phoneMasked "+2547*****678"
    bool safeToContact "survivor consent"
    string ward "area, never GPS by default"
    text narrativeEnc "transcript / SMS, encrypted"
    json triage "AI + rules brief"
    json pathway "ordered next steps"
    string urgency
    string status
  }
  CASE_EVENT {
    uuid id
    string type "CREATED TRIAGED NOTIFIED_TIER1 ACKNOWLEDGED ESCALATED ACCESSED CONTACT_REVEALED ..."
    string actor
    text detail
  }
  RESPONDER {
    string name
    string organisation
    string phone
    int tier "1 community, 2 institutional"
    array wards
    string verifiedBy
  }
  RESOURCE {
    string category "helpline medical police legal shelter child emergency counselling"
    string name
    string coverage "national | county | ward"
    string phone
    bool verified
    string source
  }
  CASE ||--o{ CASE_EVENT : "audit trail"
```

## 6. The triage contract

Input to the model: channel, interface language, menu facts, and the report inside `<report>` tags marked as untrusted data. Output: one JSON object (see `src/ai/prompts.ts`). Post-processing (`normalizeTriage`):

* unknown enum values are dropped, strings clamped, arrays de-duplicated;
* the rules floor is merged in: `immediate_danger = ai || rules`, `urgency = max(ai, rules)`, risk flags are unioned;
* if the model is slow (>12 s), errors, or is not configured, the rules result is used unchanged.

This makes the AI a strict improvement and never a single point of failure.

## 7. Deployment

* PoC: `npm start` anywhere with Node 18+, file database, `ngrok` for Africa's Talking callbacks.
* Production shape: Docker image (multi-stage, `Dockerfile`), PostgreSQL (`docker-compose.yml`), behind Nginx/Traefik with TLS on a Contabo VPS; webhook endpoints restricted to Africa's Talking IPs; encryption key and pepper from a secrets store; daily encrypted backups with the same retention window.
