export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const p = String(raw).replace(/[\s\-()]/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('00')) return '+' + p.slice(2);
  if (p.startsWith('0') && p.length === 10) return '+254' + p.slice(1);
  if (p.startsWith('254')) return '+' + p;
  if (/^[17]\d{8}$/.test(p)) return '+254' + p;
  return p;
}

/** +254712345678 -> +2547*****678 : enough for a responder to recognise a repeat caller, not enough to dial. */
export function maskPhone(p: string): string {
  if (!p) return null;
  if (p.length <= 6) return p.slice(0, 2) + '***';
  return p.slice(0, 5) + '*'.repeat(Math.max(2, p.length - 8)) + p.slice(-3);
}
