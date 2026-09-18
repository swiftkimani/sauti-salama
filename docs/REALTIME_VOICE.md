# Real-time voice: what it takes

The call line today talks in turns: it asks, the caller speaks until they pause, the recording is transcribed, the
model decides, and the line answers. Each turn costs roughly 3 to 6 seconds, and the caller cannot interrupt.
That is a limit of the telephony provider, not of our code: Africa's Talking voice offers `Say`, `Play`,
`GetDigits`, `Dial`, `Record`, `Enqueue`, `Dequeue`, `Conference`, `Redirect` and `Reject`. None of them streams
call audio, so nothing can react to a caller mid-sentence.

Real-time means: the caller hears a reply in under a second, can interrupt, and hears one natural Kenyan voice in
Kiswahili, English or Sheng.

## What has to change

Only the transport. `ConversationService` already takes the turns so far and returns the updated brief and the
next question, and it knows nothing about Africa's Talking. A real-time agent drives the same decisions, either by
calling it per utterance or by giving a speech-to-speech model the same system prompt and the same rules:
questions may be generated, facts come from `src/i18n/call.ts`, and the rules floor in `src/ai/rules.ts` still
decides urgency. Cases, consent, alerts, escalation and the console do not change at all.

```
phone -> SIP trunk -> media server (WebRTC/RTP)
                        |
                        +-- streaming speech-to-text --> ConversationService --> speech synthesis
                        |                                     |
                        +-------------------------------------+--> cases, responders, escalation (unchanged)
```

## Options

| Route | Number | What you run | Notes |
|---|---|---|---|
| Africa's Talking SIP trunk into your own media server | Keep the Kenyan number | Media server (LiveKit, Asterisk, FreeSWITCH) plus the agent | Keeps the local number and local rates; most ops work; confirm SIP terms with Africa's Talking first |
| Twilio (or Telnyx/Vonage) media streams | New number; Kenyan numbers are limited and may need local presence | Their WebSocket audio into the agent | Least infrastructure; per-minute cost in dollars; check whether the number can be reached from Kenyan mobile networks and who pays |
| Hybrid | Keep Africa's Talking for USSD/SMS and today's call line | Add real-time only for callers who need it | Two paths to maintain; sensible while piloting |

For the agent itself, either a speech-to-speech model (OpenAI Realtime, Gemini Live) or a pipeline of streaming
speech-to-text, the model and text-to-speech (Pipecat, LiveKit Agents). A pipeline is more work but lets you pick a
Kiswahili voice and keep the rules floor between the model and what is spoken.

## Before committing to it

1. **Kiswahili and Sheng, on a phone line.** Test speech-to-text and the voice on real recordings at 8 kHz with
   background noise, not in a quiet room. This decides whether real-time is actually better than turns.
2. **Cost per call.** Per-minute telephony plus streaming audio and model time. Compare with the current cost: one
   transcription and a few small completions.
3. **Who answers when it breaks.** A media server is a 24/7 service. Today, if the AI or transcription fails, the
   call still produces a case and a responder is alerted; keep that fallback.
4. **Recording and consent.** Streaming audio through more providers means more processors to name in the DPIA and
   more data-processing agreements (see SAFETY_PRIVACY_COMPLIANCE.md, cross-border transfer).
5. **Interruption is a safety feature, not a demo.** A survivor saying "he is coming" must be able to cut the line
   off. Make sure barge-in works before promising it.

## Rough sequence

1. Prove the speech quality on real Kenyan call audio (a day of recordings).
2. Pick the transport and get one number ringing into a media server.
3. Wire the agent to `ConversationService`, keep the guardrails and the rules floor.
4. Run both lines side by side: the turn-based line stays the fallback when the agent is down.
5. Pilot with responders listening in, and compare time-to-alert against the turn-based line.
