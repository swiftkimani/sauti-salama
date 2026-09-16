# Sauti Salama - pitch deck (12 slides)

Build in Canva/Figma/PowerPoint. Palette: deep plum #5B2A86 (GBV awareness purple), off-white #F3F5F7, ink #17202A, urgency red #A61B1B. One idea per slide, big type, real screenshots from the simulator and console.

---

**1. Title**
Sauti Salama - Safe Voice. An offline-first, AI-assisted GBV reporting and referral line for Kenya.
Benard Kimani - OSF x Andela Hackathon 2026 - Safety, Reporting & Protection.
*Say:* "In Kenya, the phone a survivor holds is usually a feature phone, often shared, often checked. Every GBV app assumes the opposite. I built the opposite of an app."

**2. The invisible line**
Visual: a feature phone next to a smartphone; one stat block.
KDHS 2022: over 40% of ever-partnered women have experienced intimate-partner violence; 34% of all women physical violence since 15; 13-14% sexual violence. Most never seek formal help.
*Say:* "The barriers are practical: no airtime, no data, no privacy, no idea that post-rape care is free and only works for 72 hours."

**3. What exists today**
Visual: three columns - Helpline 1195 (call only), NGO apps (smartphone + data), police station (in person).
*Say:* "All three require the survivor to speak, to have data, or to travel. If the abuser is in the next room, none of them work."

**4. The idea in one sentence**
"Any phone. No internet. No app. Two key presses to reach a vetted neighbour."
Visual: three channels - Call line - USSD `*384*7262#` - SMS - feeding one backend.

**5. Live demo (the golden path)**
Cut to the demo video or do it live: USSD "I am in danger NOW" -> responder SMS arrives in under 5 seconds -> console shows the case -> responder ACKs by SMS -> survivor checks status -> survivor erases the report.
*Say:* "Every step you saw works with zero data on the survivor's side."

**6. The call line and the silent alert**
Visual: IVR transcript from the simulator; the "9" key highlighted.
*Say:* "Speak in English or Kiswahili. Get a reference number read back. If you can't talk safely, press 9: the call drops in one second and the call log shows a misdial, but a responder has already been paged."

**7. AI structures, humans decide**
Visual: raw Kiswahili/Sheng SMS on the left -> structured brief on the right (type, urgency, 72h flag, risk flags, EN+SW summary).
*Say:* "Claude turns the report into a responder brief in both languages. A rules-based floor runs underneath: the AI can raise urgency, it can never lower a danger signal, and the line works with no AI at all. The AI never writes a word a survivor sees."

**8. Right next step, right deadline**
Visual: the console's next-step checklist: 72h PEP / 120h EC + PRC form, P3 form + Gender Desk, Protection Order (PADVA 2015), FIDA, Childline 116, shelter via 1195.
*Say:* "Every case leaves with the most important deadline and a free number. This is the 'pull' side: trusted information people can act on."

**9. Shifting power to communities**
Visual: Tier 1 (ward responders: CHPs, peace committee, trained volunteers) -> no ACK in 10 min -> Tier 2 (GBV Recovery Centre desk) -> police only by the survivor's choice.
*Say:* "The first responder is a vetted neighbour who can be there in minutes. That is what 'transformative peace' looks like at ward level."

**10. Privacy by design - Kenya DPA 2019**
Visual: padlock; four lines: no registration - encrypted at rest - consent before any SMS - erase from a free USSD session.
*Say:* "No ID, no account. Phone numbers are masked in the console and revealed only with consent, and every reveal is logged. Closed cases purge after 90 days. There is no blockchain because the right to erasure must be real."

**11. What we learn, safely**
Visual: ward-level heat map mock (aggregate counts only).
*Say:* "County GBV working groups get anonymised ward-level patterns - never a case. That is the accountability layer."

**12. Roadmap and ask**
Pilot: two Nairobi responder networks + one GBV Recovery Centre; metric: time-to-acknowledge and survivor-reported outcomes. Then pre-recorded Kiswahili prompts and three more languages, telco zero-rating, WhatsApp, responder accounts.
*Say:* "The code runs today on a KSh 0 phone. What it needs next is a community to run it with. Asante."
