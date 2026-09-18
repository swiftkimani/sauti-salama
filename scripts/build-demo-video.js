/*
 * Builds the Sauti Salama demo video from the screenshots in docs/demo/frames.
 *
 *   npm run demo:video        silent cut with captions        -> docs/demo/sauti-salama-demo.mp4
 *   npm run demo:video:vo     with the Kenyan voice-over      -> docs/demo/sauti-salama-demo-vo.mp4
 *
 * Each scene is composed as HTML and rendered to a 1920x1080 PNG with headless Chrome, so no ffmpeg text
 * filters are needed. With --voice, every line is spoken first and each shot is then held for as long as its
 * line takes, so picture and narration always match.
 *
 * Narration voices come from Microsoft Edge's free text-to-speech (no account): en-KE-ChilembaNeural, a Kenyan
 * English male voice, with one Kiswahili line in sw-KE-ZuriNeural. Install it once with:
 *   python3 -m venv .venv && .venv/bin/pip install edge-tts   (then EDGE_TTS=.venv/bin/edge-tts npm run demo:video:vo)
 * Clips are cached in docs/demo/audio/. To use your own voice for a line, drop an mp3 with the same name
 * there and it will be used as it is - your voice beats any model.
 *
 * Edit SCENES below to change wording, order or pacing.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const VOICE_MODE = process.argv.includes('--voice');
const ROOT = path.join(__dirname, '..');
const FRAMES = path.resolve(process.env.DEMO_FRAMES || path.join(ROOT, 'docs', 'demo', 'frames'));
const AUDIO = path.join(ROOT, 'docs', 'demo', 'audio');
const OUT = path.resolve(process.env.DEMO_OUT || path.join(ROOT, 'docs', 'demo', VOICE_MODE ? 'sauti-salama-demo-vo.mp4' : 'sauti-salama-demo.mp4'));
// Scene PNGs and audio segments are build scrap: keep them out of the repository.
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'sauti-demo-'));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EDGE_TTS = process.env.EDGE_TTS || 'edge-tts';
const VOICE_EN = process.env.DEMO_VOICE_EN || 'en-KE-ChilembaNeural';
const VOICE_SW = process.env.DEMO_VOICE_SW || 'sw-KE-ZuriNeural';
const RATE = process.env.DEMO_VOICE_RATE || '+16%';
/** Quiet before and after each spoken line, so the cut breathes. */
const LEAD = 0.35, TAIL = 0.42;

const SCENES = [
  {
    id: 'title', card: true, title: 'Sauti Salama', seconds: 5.5,
    lines: ['A gender-based violence reporting line for any phone in Kenya', 'No internet. No app. No smartphone.'],
    say: 'More than four in ten Kenyan women with a partner have been hit or forced by him. Most never report it. Sauti Salama is a reporting line for any phone.',
  },
  {
    id: 'call-idle', frame: 'f00.jpg', label: 'Call line', seconds: 5,
    caption: 'The call line has no menu and no key presses. It answers, listens and asks — the way an emergency call is taken.',
    say: 'This is the call line in our simulator, the caller\'s phone on the left. No menu, no key presses: it answers the way an emergency call is taken.',
  },
  {
    id: 'greeting', frame: 'f01.jpg', label: 'Call line', seconds: 5,
    caption: 'It greets the caller in English and Kiswahili, then listens.',
    say: [{ text: 'She calls. The line greets her in English and Kiswahili, then starts listening.' }, { lang: 'sw', text: 'Uko salama hapa. Niambie kinachoendelea.' }],
  },
  {
    id: 'typing', frame: 'f02.jpg', label: 'Call line', seconds: 4.5,
    caption: 'The caller speaks. In the simulator you type what she would say.',
    say: 'You type what the caller would say. On a real call this is her voice, transcribed by Whisper.',
  },
  {
    id: 'alerted', frame: 'f03.jpg', label: 'Call line', seconds: 7.5,
    caption: 'One sentence in, a vetted community responder is already alerted: CRITICAL, Kayole, abuser present, weapon — long before the call ends.',
    say: 'On the right, one sentence in, an alert has already gone to a vetted responder in her ward. Critical. Kayole. Abuser present. A weapon. She is still on the call.',
  },
  {
    id: 'reference', frame: 'f04.jpg', label: 'Call line', seconds: 6,
    caption: 'It asks one question at a time, then reads the case reference back to her.',
    say: 'The line then asks one question at a time, and reads her case reference back to her, so she can check on it later.',
  },
  {
    id: 'consent', frame: 'f05.jpg', label: 'Consent', seconds: 6.5,
    caption: 'Consent is spoken, not keyed: is this phone safe to call or text? Anything unclear counts as no.',
    say: 'Near the end it asks whether this phone is safe to call or text. She answers in words, not key presses. Anything unclear counts as no.',
  },
  {
    id: 'closing', frame: 'f06.jpg', label: 'Consent', seconds: 7,
    caption: 'The closing is reviewed text only — 999, 112, 1195. The AI may ask questions; it may never state a fact or a number.',
    say: 'The closing lines you see here are reviewed text. The model may ask questions; it may never state a fact or a number, so it cannot invent a helpline.',
  },
  {
    id: 'ussd', frame: 'f10.jpg', label: 'USSD', seconds: 7,
    caption: 'USSD, for when speaking is not safe: two key presses and an area. Silent, and nothing is left in the call log.',
    say: 'Now USSD, for a survivor who cannot speak. Two key presses and an area, and the alert is out. Silent, nothing left in the call log.',
  },
  {
    id: 'sms', frame: 'f11.jpg', label: 'SMS', seconds: 5,
    caption: 'SMS, in English, Kiswahili or Sheng.',
    say: 'Third channel: a plain S M S, here in Sheng.',
  },
  {
    id: 'reply', frame: 'f12.jpg', label: 'SMS', seconds: 6,
    caption: 'One short, neutral reply — and nothing more until she says texting is safe.',
    say: 'She gets one short, neutral reply, and nothing more until she replies that texting is safe.',
  },
  {
    id: 'ack', frame: 'f13.jpg', label: 'SMS', seconds: 5.5,
    caption: 'A registered responder accepts by SMS. Nobody else can.',
    say: 'A responder accepts the case by texting back. Only registered responder numbers can do this.',
  },
  {
    id: 'queue', frame: 'f14.jpg', label: 'Responder console', seconds: 6.5,
    caption: 'The console lists the most urgent first, and shows nothing that identifies a survivor until a case is opened.',
    say: 'This is the responder console. Cases are listed most urgent first, and nothing identifies a survivor until a case is opened.',
  },
  {
    id: 'brief', frame: 'f15.jpg', label: 'Responder console', seconds: 7.5,
    caption: 'The brief, in English and Kiswahili: what happened, who, where, danger now. A rules floor under the AI means danger can never be talked down.',
    say: 'Opening the case shows the brief in English and Kiswahili: what happened, who, where, danger now. Underneath, a rules engine the A I can never talk danger down.',
  },
  {
    id: 'pathway', frame: 'f16.jpg', label: 'Referral pathway', seconds: 7,
    caption: 'Next steps with real deadlines: free care within 72 hours, the P3 form, safe shelter.',
    say: 'Below the brief, next steps with real deadlines: free post-rape care within seventy two hours, the P three form, safe shelter.',
  },
  {
    id: 'police', frame: 'f17.jpg', label: 'Referral pathway', seconds: 6.5,
    caption: 'Police only if the survivor asks for it. Her choice, never the default.',
    say: 'Notice the police step. It is offered only if the survivor asks for it. Her choice, never the default.',
  },
  {
    id: 'accepted', frame: 'f18.jpg', label: 'Responder console', seconds: 5.5,
    caption: 'Accepted in three minutes. Escalation stops and the survivor is told.',
    say: 'The responder accepts, here in three minutes. Escalation stops and she is told. If nobody accepts, it goes to the tier two desk.',
  },
  {
    id: 'privacy', frame: 'f19.jpg', label: 'Privacy', seconds: 7.5,
    caption: 'When she said the phone is not safe, the number cannot be revealed at all — and every reveal is written to the audit log.',
    say: 'On this case she said the phone is not safe, so the reveal button is dead. Every reveal is logged under a name.',
  },
  {
    id: 'erase-confirm', frame: 'f22.jpg', label: 'Right to erasure', seconds: 6,
    caption: 'Erasure is hers to ask for: the responder types the reference to confirm.',
    say: 'And if she asks for her report to be deleted, the responder confirms by typing the reference.',
  },
  {
    id: 'erased', frame: 'f23.jpg', label: 'Right to erasure', seconds: 6.5,
    caption: 'The case and its whole audit trail are gone. A real hard delete — which is why there is no blockchain here.',
    say: 'The case and its whole audit trail are gone. A real hard delete, which is why there is no blockchain anywhere near this.',
  },
  {
    id: 'end', card: true, title: 'Sauti Salama', seconds: 7,
    lines: ['Voice, USSD and SMS over Africa’s Talking · NestJS · PostgreSQL', 'Open-weight AI behind a rules floor · AES-256-GCM · Kenya DPA 2019 by design'],
    say: 'Voice, USSD and S M S over Africa\'s Talking. An open weight model behind a rules floor. Encrypted at rest, Kenya\'s Data Protection Act by design. A vetted neighbour first, and the police only if she chooses.',
  },
];

const shell = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const duration = (file) => Number(shell('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim());
const ff = (args) => shell('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);

// ------------------------------------------------------------------ narration
function synthesise(scene) {
  fs.mkdirSync(AUDIO, { recursive: true });
  const parts = (Array.isArray(scene.say) ? scene.say : [{ text: scene.say }]);
  const clips = parts.map((part, i) => {
    const file = path.join(AUDIO, `${scene.id}${parts.length > 1 ? `-${i + 1}` : ''}.mp3`);
    const stamp = `${file}.txt`;
    const text = part.text.trim();
    const fresh = fs.existsSync(file) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === hash(text);
    // A clip with no stamp beside it was put there by hand (someone's own voice): never overwrite it.
    const handmade = fs.existsSync(file) && !fs.existsSync(stamp);
    if (!fresh && !handmade) {
      shell(EDGE_TTS, ['--voice', part.lang === 'sw' ? VOICE_SW : VOICE_EN, '--rate', RATE, '--text', text, '--write-media', file]);
      fs.writeFileSync(stamp, hash(text));
    }
    return file;
  });
  if (clips.length === 1) return clips[0];
  const joined = path.join(AUDIO, `${scene.id}.mp3`);
  const list = path.join(WORK, `${scene.id}-parts.txt`);
  fs.writeFileSync(list, clips.map((c) => `file '${c}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  return joined;
}
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// ------------------------------------------------------------------ pictures
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1920px; height:1080px; background:#0E0B16;
         background-image: radial-gradient(1200px 700px at 50% -10%, #241A38 0%, #0E0B16 62%);
         color:#fff; font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif; overflow:hidden; }
  .wrap { height:100%; display:flex; flex-direction:column; align-items:center; padding:38px 60px 46px; }
  .top { width:100%; display:flex; align-items:center; gap:16px; margin-bottom:22px; }
  .dot { width:30px; height:30px; border-radius:9px; background:linear-gradient(135deg,#7C3AED,#4C1D95); }
  .brand { font-size:25px; font-weight:600; letter-spacing:.2px; }
  .label { margin-left:auto; font-size:23px; color:#C9C2DA; background:rgba(255,255,255,.07);
           padding:8px 18px; border-radius:999px; }
  .shot { border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,.12);
          box-shadow:0 30px 80px rgba(0,0,0,.55); }
  .shot img { display:block; width:1580px; }
  .cap { margin-top:auto; max-width:1560px; text-align:center; font-size:37px; line-height:1.38;
         color:#F3F0FA; text-wrap:balance; }
  .card { height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; gap:26px; }
  .card h1 { font-size:104px; font-weight:700; letter-spacing:-1px; }
  .card p { font-size:38px; line-height:1.45; color:#C9C2DA; max-width:1500px; }
  .rule { width:120px; height:5px; border-radius:3px; background:linear-gradient(90deg,#7C3AED,#C4B5FD); }
</style></head><body>${body}</body></html>`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(scene, i) {
  const id = String(i).padStart(2, '0');
  const html = scene.card
    ? page(`<div class="card"><div class="dot" style="width:64px;height:64px;border-radius:18px"></div><h1>${esc(scene.title)}</h1><div class="rule"></div>${scene.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`)
    : page(`<div class="wrap">
        <div class="top"><span class="dot"></span><span class="brand">Sauti Salama</span><span class="label">${esc(scene.label)}</span></div>
        <div class="shot"><img src="file://${path.join(FRAMES, scene.frame)}"></div>
        <p class="cap">${esc(scene.caption)}</p>
      </div>`);
  const htmlFile = path.join(WORK, `scene${id}.html`);
  const png = path.join(WORK, `scene${id}.png`);
  fs.writeFileSync(htmlFile, html);
  shell(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1920,1080', `--screenshot=${png}`, `file://${htmlFile}`]);
  if (!fs.existsSync(png)) throw new Error(`scene ${scene.id} did not render`);
  return png;
}

// ------------------------------------------------------------------ build
fs.mkdirSync(WORK, { recursive: true });

const timed = SCENES.map((scene) => {
  if (!VOICE_MODE) return { scene, seconds: scene.seconds };
  const clip = synthesise(scene);
  const spoken = duration(clip);
  process.stdout.write(`  spoke ${scene.id} (${spoken.toFixed(1)}s)\n`);
  return { scene, clip, spoken, seconds: Math.max(scene.seconds, LEAD + spoken + TAIL) };
});

const pngs = timed.map((t, i) => {
  const png = render(t.scene, i);
  process.stdout.write(`  rendered ${t.scene.id}\r`);
  return png;
});

const total = timed.reduce((a, t) => a + t.seconds, 0);
const list = path.join(WORK, 'scenes.txt');
fs.writeFileSync(list, [...pngs.map((p, i) => `file '${p}'\nduration ${timed[i].seconds}`), `file '${pngs[pngs.length - 1]}'`].join('\n'));

const silent = path.join(WORK, 'picture.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `fps=30,format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-movflags', '+faststart', silent]);

if (!VOICE_MODE) {
  fs.copyFileSync(silent, OUT);
} else {
  // One audio segment per scene, each padded to exactly that scene's length, then joined and muxed.
  const segs = timed.map((t, i) => {
    const seg = path.join(WORK, `audio${String(i).padStart(2, '0')}.wav`);
    ff(['-i', t.clip, '-af', `adelay=${Math.round(LEAD * 1000)}|${Math.round(LEAD * 1000)},apad`, '-t', String(t.seconds),
      '-ar', '48000', '-ac', '2', seg]);
    return seg;
  });
  const audioList = path.join(WORK, 'audio.txt');
  fs.writeFileSync(audioList, segs.map((s) => `file '${s}'`).join('\n'));
  const track = path.join(WORK, 'narration.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', audioList, '-c', 'copy', track]);
  ff(['-i', silent, '-i', track, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT]);
}

const mins = Math.floor(total / 60), secs = Math.round(total % 60);
console.log(`\nWrote ${OUT}`);
console.log(`  ${mins}:${String(secs).padStart(2, '0')}, ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB${VOICE_MODE ? `, voiced by ${VOICE_EN}` : ', silent'}`);
