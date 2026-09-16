/** Africa's Talking Voice API call-action XML builders. */
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const say = (text: string) => `<Say voice="woman" playBeep="false">${esc(text)}</Say>`;
export const play = (url: string) => `<Play url="${esc(url)}"/>`;
export const getDigits = (o: { callbackUrl: string; prompt: string; numDigits?: number; timeout?: number; finishOnKey?: string }) =>
  `<GetDigits timeout="${o.timeout ?? 10}" numDigits="${o.numDigits ?? 1}" finishOnKey="${esc(o.finishOnKey ?? '#')}" callbackUrl="${esc(o.callbackUrl)}">${o.prompt}</GetDigits>`;
export const record = (o: { callbackUrl: string; prompt: string; maxLength?: number; timeout?: number }) =>
  `<Record finishOnKey="#" maxLength="${o.maxLength ?? 180}" timeout="${o.timeout ?? 8}" trimSilence="true" playBeep="true" callbackUrl="${esc(o.callbackUrl)}">${o.prompt}</Record>`;
export const dial = (numbers: string[], callerId?: string) =>
  `<Dial phoneNumbers="${esc(numbers.join(','))}" record="false" sequential="true"${callerId ? ` callerId="${esc(callerId)}"` : ''}/>`;
export const response = (...actions: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${actions.join('')}</Response>`;
