# Kiswahili on the call line

**Status: pre-recording is now possible again.** The call line no longer plays a fixed menu, but every question it
can ask comes from a finite reviewed bank (`CALL.questions`, six questions in English and Kiswahili) chosen per
call by the model. That makes the whole caller-facing script recordable: the greeting, the six questions, the two
consent questions, the facts and the closings. Africa's Talking text-to-speech reads both languages today, and
its Kiswahili has an English accent.

## What that means

* The reviewed lines the line can still say are in `src/i18n/call.ts`: the greeting, the two consent questions,
  the facts (emergency numbers, the 72-hour window, Childline, the helpline), the closings and the fallback
  questions used when no AI key is set.
* Because the questions are now selected rather than written, there is no line a caller can hear that is not in
  that file. Recording the full set removes text-to-speech from the caller's side of the call entirely, instead of
  leaving a call that switches voices mid-conversation.

## The plan instead

Neural Kiswahili text-to-speech, so every line - reviewed or generated - is spoken in one natural Kenyan voice.
It is part of the real-time voice work in [REALTIME_VOICE.md](REALTIME_VOICE.md), which also removes the pauses
between turns.

If you want to test a recorded voice before then, record the reviewed lines from `src/i18n/call.ts`, keep the
wording exactly as written, and raise it with the maintainer: wiring `<Play>` back in is a small change, but which
lines are recorded has to match what the line actually says.
