# Kiswahili voice prompts to record

The call line reads Kiswahili prompts with text-to-speech, which sounds foreign to callers. Recording them in a calm, warm Kenyan voice makes the line more trustworthy and easier to follow, especially for callers with low literacy.

## How to record

* Quiet room, phone about 20 cm away, normal pace, a short pause at every full stop.
* Read the text exactly as written. Numbers such as "1 1 9 5" are read digit by digit.
* Save each prompt as an MP3 with the file name in the first column (any recorder app; convert with Audacity if needed).
* Do not record the case reference (for example "S S dash 4 K 2 F"). It is read out automatically between part 1 and part 2.

## Switching them on

1. Put the files in `public/audio/sw/`.
2. Set `SW_AUDIO_BASE_URL=/audio/sw` in `.env`. The server plays them from its own public address.
3. Call the line and choose Kiswahili. English prompts keep using text-to-speech.

The welcome ("For English, press 1. Kwa Kiswahili, bonyeza 2.") is bilingual and stays text-to-speech.

## Prompts

| File | When it plays | Text to read |
|---|---|---|
| `main.mp3` | Main menu | Bonyeza 1 kutuambia kilichotokea. Bonyeza 2 kusikia maelezo ya msaada wa dharura. Bonyeza 3 kuzungumza na mshauri. Ikiwa huwezi kuongea kwa usalama, bonyeza 9 sasa na tutamjulisha mhudumu kimya kimya. |
| `record.mp3` | Before the beep | Chukua muda wako. Baada ya mlio, tuambie kilichotokea, uko wapi, na kama uko salama sasa hivi. Bonyeza alama ya reli ukimaliza. |
| `afterRecord_1.mp3` | After the recording, part 1 (the reference is read out after it) | Asante. Nambari yako ya rejeleo ni |
| `afterRecord_2.mp3` | After the recording, part 2 (the safety question) | Mhudumu wa kuaminika katika eneo lako anaarifiwa. Ni salama kwetu kupiga simu au kutuma SMS kwa simu hii? Bonyeza 1 kwa ndiyo, au 2 kwa hapana. |
| `consentYes.mp3` | Caller pressed 1: safe to contact | Asante. Mhudumu wako atawasiliana nawe kwa nambari hii. Ikiwa haitakuwa salama tena, piga simu hii tena na ubonyeze 9. Msaada wa bure wakati wowote: 1 1 9 5. Uwe salama. |
| `consentNo.mp3` | Caller pressed 2: not safe | Sawa. Hakuna atakayepiga au kutuma SMS kwa simu hii. Mhudumu wako atatumia nambari yako ya rejeleo, na unaweza kupiga simu hii tena wakati wowote kuangalia maendeleo. Unaweza kufuta simu hii kwenye orodha ya simu zako. Msaada wa bure wakati wowote: 1 1 9 5. |
| `info.mp3` | Urgent help information | Ikiwa kumetokea dhuluma ya kingono, nenda kituo chochote cha afya ndani ya saa 72 kwa dawa ya bure ya kuzuia HIV na mimba, na uombe fomu ya PRC. Ikiwa uko hatarini sasa, piga 9 9 9 au 1 1 2. Ushauri wa bure wakati wowote: 1 1 9 5. Kwa mtoto, piga Childline 1 1 6. |
| `infoMenu.mp3` | After the information | Bonyeza 1 kusikia tena, 2 kuacha ripoti, au kata simu. |
| `transfer.mp3` | Connecting to a counsellor | Tunakuunganisha na mshauri sasa. Tafadhali subiri. |
| `callback_1.mp3` | Counsellors busy, part 1 (the reference is read out after it) | Washauri wote wako na simu nyingine sasa. Tumeandikisha ombi lako, nambari |
| `callback_2.mp3` | Counsellors busy, part 2 (the safety question) | na mhudumu wa kuaminika atakupigia. Ni salama kupiga simu hii? Bonyeza 1 kwa ndiyo, 2 kwa hapana. |
| `invalid.mp3` | Invalid key | Samahani, hicho si chaguo sahihi. |
| `goodbye.mp3` | Goodbye | Msaada wa bure wakati wowote: 1 1 9 5. Kwaheri, uwe salama. |

Source of truth: `src/i18n/messages.ts`. If a prompt changes there, record that file again.
