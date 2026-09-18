# Demo video

Two cuts, both built from the same screenshots of the running system (a throwaway server: in-memory database, fictional responders, `demo-token`). Nothing in them is a mock-up.

| File | Length | Sound |
|---|---|---|
| [`demo/sauti-salama-demo-vo.mp4`](demo/sauti-salama-demo-vo.mp4) | 2:56 | Narrated in Kenyan English, captions burned in |
| [`demo/sauti-salama-demo.mp4`](demo/sauti-salama-demo.mp4) | 2:11 | Silent, captions only |

```bash
npm run demo:video        # silent cut
npm run demo:video:vo     # narrated cut (needs edge-tts, see below)
```

**`scripts/build-demo-video.js` is the source of truth.** Captions, spoken lines, shot order and minimum hold times are one array at the top of it. Change a line there and rebuild; this page describes the shape, not the exact words.

## The voice

* **en-KE-AsiliaNeural** — Kenyan English, female — narrates throughout.
* **sw-KE-ZuriNeural** — Kenyan Kiswahili — speaks the one Kiswahili line, where the video says the call line greets in both languages. You hear what a caller hears: *"Uko salama hapa. Niambie kinachoendelea."*

Both come from Microsoft Edge's text-to-speech, which needs no account. Install once:

```bash
python3 -m venv .venv && .venv/bin/pip install edge-tts
EDGE_TTS=.venv/bin/edge-tts npm run demo:video:vo
```

Useful switches: `DEMO_VOICE_EN=en-KE-ChilembaNeural` (Kenyan male), `DEMO_VOICE_RATE=+18%` (brisker), `DEMO_VOICE_SW=sw-KE-RafikiNeural`.

The narration text is sent to Microsoft's speech service to be synthesised. It is project copy; no survivor data goes anywhere near it.

### Using your own voice

Every line is cached as its own file in `demo/audio/` (`title.mp3`, `alerted.mp3`, `privacy.mp3`, …). Record a line yourself, save it over the file of the same name, and the builder leaves it alone and re-synthesises only the rest. A real Kenyan voice — yours — will carry a line about trust better than any model, and you can start with just the opening and closing.

The picture is cut to the speech: each line is spoken first, measured, and its shot held exactly that long plus a short breath. So a longer or shorter recording never falls out of sync; it just changes that shot's length.

## Shot list

| # | On screen | Beat |
|---|---|---|
| 1 | Title card | The scale of it, and why existing tools miss: they assume a smartphone and a private moment |
| 2–3 | Call line, idle then greeting | A line, not an app. No menu, no key presses. Greets in English and Kiswahili |
| 4 | Caller's words typed | The simulator stands in for a phone, so the flow runs with no phone bill |
| 5 | Responder alert in the outbox | **The moment:** one sentence in, a vetted responder is alerted — critical, Kayole, abuser present, weapon |
| 6–8 | Question, reference, consent, closing | One question at a time; consent spoken, not keyed; the closing is reviewed text only |
| 9 | USSD danger alert | For a survivor who cannot speak: two key presses, silent, nothing in the call log |
| 10–12 | SMS report, reply, responder ACK | Sheng and Kiswahili welcome; one neutral reply; only registered responders can accept |
| 13–17 | Console: queue, brief, pathway, police, accepted | What a responder sees, the rules floor under the AI, deadlines that matter, police only on request |
| 18 | Do-not-contact case | The number cannot be revealed at all; every reveal is in the audit log |
| 19–20 | Erasure | Hers to ask for, and a real hard delete — audit trail included |
| 21 | End card | The stack, the safeguards, and who the line routes to first |

## Re-recording the screens

Start a throwaway server so nothing real is on camera, then walk the simulator and the console:

```bash
npm run build
PORT=3200 SQLITE_PATH=:memory: DASHBOARD_TOKEN=demo-token DEMO_RESPONDER_PHONE=+254700000111 \
  TIER2_RESPONDER_PHONE=+254700000222 ESCALATION_MINUTES=1 node dist/main.js
# simulator: http://localhost:3200/simulator.html      console: http://localhost:3200/dashboard.html?token=demo-token
```

Replace the images in `demo/frames/` (keep the file names) and rebuild. With `GROQ_API_KEY` set, the call line asks its own questions and the brief comes from the model; without it you get the reviewed fallback questions and the rules engine, which is what the current cut shows.

Build scrap (scene PNGs, audio segments) goes to a temp directory, so only the two videos, `frames/` and `audio/` live in the repository.
