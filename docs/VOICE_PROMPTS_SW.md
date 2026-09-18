# Kiswahili on the call line

**Status: the pre-recorded prompt set is on hold.** The call line no longer plays a fixed menu. It asks its own
questions, chosen per call, so most of what a caller hears cannot be recorded in advance. Africa's Talking
text-to-speech reads both languages today, and its Kiswahili has an English accent.

## What that means

* The reviewed lines the line can still say are in `src/i18n/call.ts`: the greeting, the two consent questions,
  the facts (emergency numbers, the 72-hour window, Childline, the helpline), the closings and the fallback
  questions used when no AI key is set.
* Those could be recorded and played with `<Play>`, but the generated questions between them would still be
  text-to-speech, so a call would switch voices mid-conversation. That is worse for trust than one voice throughout.

## The plan instead

Neural Kiswahili text-to-speech, so every line - reviewed or generated - is spoken in one natural Kenyan voice.
It is part of the real-time voice work in [REALTIME_VOICE.md](REALTIME_VOICE.md), which also removes the pauses
between turns.

If you want to test a recorded voice before then, record the reviewed lines from `src/i18n/call.ts`, keep the
wording exactly as written, and raise it with the maintainer: wiring `<Play>` back in is a small change, but which
lines are recorded has to match what the line actually says.
