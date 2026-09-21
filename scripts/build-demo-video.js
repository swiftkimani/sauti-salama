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
    "id": "title",
    "card": true,
    "title": "Sauti Salama",
    "seconds": 5.5,
    "lines": [
      "Discreet reporting and trusted next steps on a basic phone",
      "Working proof of concept · fictional cases and responders"
    ],
    "say": "A survivor may have a phone but no safe chance to speak or buy data. Sauti Salama connects discreet reporting to trusted next steps and a trackable human response."
  },
  {
    "id": "call-idle",
    "frame": "f00.jpg",
    "label": "Call line",
    "seconds": 5,
    "caption": "Working simulator: typed transcripts exercise the voice workflow. This recording uses rules-based triage.",
    "say": "This is our working simulator, using fictional cases and responders. Typed transcripts stand in for speech. The walkthrough uses rules based triage."
  },
  {
    "id": "greeting",
    "frame": "f01.jpg",
    "label": "Call line",
    "seconds": 5,
    "caption": "The line greets in English and Kiswahili, then listens. Live voice requires a provisioned number and transcription.",
    "say": "The line greets in English and Kiswahili, then listens. Live voice needs a provisioned number and transcription."
  },
  {
    "id": "typing",
    "frame": "f02.jpg",
    "label": "Call line",
    "seconds": 4.5,
    "caption": "A fictional caller describes danger. The simulator posts to the same webhook used by the voice integration.",
    "say": "Here we type a fictional report. The simulator sends it to the same webhook used by the voice integration."
  },
  {
    "id": "alerted",
    "frame": "f03.jpg",
    "label": "Call line",
    "seconds": 7.5,
    "caption": "The responder outbox shows a critical alert while intake continues. Sending an alert does not prove help has arrived.",
    "say": "An alert appears in the responder outbox while intake continues. It shows urgency, area and contact restrictions. An alert does not prove help has arrived."
  },
  {
    "id": "reference",
    "frame": "f04.jpg",
    "label": "Call line",
    "seconds": 6,
    "caption": "The line asks for missing information, then reads a case reference.",
    "say": "The line asks for missing information, then reads her case reference."
  },
  {
    "id": "consent",
    "frame": "f05.jpg",
    "label": "Consent",
    "seconds": 6.5,
    "caption": "Contact consent is spoken. Unclear answers default to no consent.",
    "say": "It asks whether this phone is safe to call or text. An unclear answer defaults to no consent."
  },
  {
    "id": "closing",
    "frame": "f06.jpg",
    "label": "Consent",
    "seconds": 7,
    "caption": "Reviewed closing text and an allow-listed English/Kiswahili question bank constrain what callers hear.",
    "say": "Closing text is reviewed. The revised implementation also restricts questions to an approved bilingual bank. Other model wording is rejected."
  },
  {
    "id": "ussd",
    "frame": "f10.jpg",
    "label": "USSD",
    "seconds": 7,
    "caption": "USSD danger flow: language, danger option, area. No mobile data; operator charges and device traces may remain.",
    "say": "USSD offers a silent route: language, danger option, then area. No mobile data is needed. Operator charges and device traces may still remain."
  },
  {
    "id": "sms",
    "frame": "f11.jpg",
    "label": "SMS",
    "seconds": 5,
    "caption": "SMS accepts free-text reports, including English, Kiswahili and Sheng.",
    "say": "SMS accepts free text. Here the report is in Sheng."
  },
  {
    "id": "reply",
    "frame": "f12.jpg",
    "label": "SMS",
    "seconds": 6,
    "caption": "One initial reply asks whether further messages are safe. Shared-phone risks still need practitioner review.",
    "say": "An initial reply asks whether further messages are safe. Shared phone risks still need practitioner review."
  },
  {
    "id": "ack",
    "frame": "f13.jpg",
    "label": "SMS",
    "seconds": 5.5,
    "caption": "A registered responder can acknowledge by SMS. Acceptance is recorded against the case.",
    "say": "A registered responder can acknowledge by SMS. The case records acceptance."
  },
  {
    "id": "queue",
    "frame": "f14.jpg",
    "label": "Responder console",
    "seconds": 6.5,
    "caption": "The authenticated console orders cases by urgency and masks phone numbers.",
    "say": "The authenticated console orders cases by urgency and masks phone numbers."
  },
  {
    "id": "brief",
    "frame": "f15.jpg",
    "label": "Responder console",
    "seconds": 7.5,
    "caption": "A structured brief supports human assessment. Rules preserve detected danger signals; they cannot guarantee detection of every risk.",
    "say": "A structured brief supports human assessment. Optional AI adds interpretation. Rules preserve the danger signals they detect, but cannot guarantee that every risk is recognised."
  },
  {
    "id": "pathway",
    "frame": "f16.jpg",
    "label": "Referral pathway",
    "seconds": 7,
    "caption": "PEP: as soon as possible, no later than 72 hours. Emergency contraception: up to 120 hours. Other care remains important afterwards.",
    "say": "Referral timing matters. HIV prevention should start as soon as possible, within seventy two hours. Emergency contraception may be offered within five days. Other care remains important afterwards."
  },
  {
    "id": "police",
    "frame": "f17.jpg",
    "label": "Referral pathway",
    "seconds": 6.5,
    "caption": "Police contact preferences are recorded. Child safeguarding requires a separately reviewed protocol.",
    "say": "Police contact preferences are recorded. Child safeguarding requires a separately reviewed protocol."
  },
  {
    "id": "accepted",
    "frame": "f18.jpg",
    "label": "Responder console",
    "seconds": 5.5,
    "caption": "Acceptance time is measured in the demo. Unaccepted cases escalate; completed assistance needs separate follow-up.",
    "say": "The demo records time to acceptance. Unaccepted cases escalate. Completed assistance needs separate follow up."
  },
  {
    "id": "privacy",
    "frame": "f19.jpg",
    "label": "Privacy",
    "seconds": 7.5,
    "caption": "The reveal control requires safe-contact consent. Each reveal is logged.",
    "say": "This phone was marked unsafe, so the reveal control is disabled. Each reveal is logged."
  },
  {
    "id": "erase-confirm",
    "frame": "f22.jpg",
    "label": "Right to erasure",
    "seconds": 6,
    "caption": "Deletion requires the case reference. Survivor commands are tied to the reporting phone.",
    "say": "Deletion requires the case reference. Survivor commands are tied to the reporting phone."
  },
  {
    "id": "erased",
    "frame": "f23.jpg",
    "label": "Right to erasure",
    "seconds": 6.5,
    "caption": "Application case and audit records are deleted. Delivered SMS, provider logs and backups require separate controls.",
    "say": "Application case and audit records are deleted. Delivered messages, provider logs and backups require separate controls."
  },
  {
    "id": "end",
    "card": true,
    "title": "Sauti Salama",
    "seconds": 7,
    "lines": [
      "Next: a supervised Nairobi pilot with an accountable operating partner",
      "Measure completion, safe contact, response time and cost per referral"
    ],
    "say": "The next step is a supervised Nairobi pilot with an accountable operating partner. Measure completion, safe contact, response time and cost per referral. The software runs; real world impact remains to be tested."
  }
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
