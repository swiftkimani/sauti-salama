import { randomInt } from 'crypto';

// No 0/O/1/I so a reference can be read out loud or typed on a keypad without confusion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genRef(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `SS-${s}`;
}

/** Accepts "SS-4K2F", "ss4k2f", "4k2f" -> "SS-4K2F" or null. */
export function normalizeRef(input: string): string | null {
  if (!input) return null;
  const m = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').match(/^(?:SS)?([A-Z2-9]{4})$/);
  return m ? `SS-${m[1]}` : null;
}

/** "SS-4K2F" -> "S S dash 4 K 2 F" for text-to-speech. */
export function spellRef(ref: string): string {
  const [a, b] = ref.split('-');
  return `${a.split('').join(' ')} dash ${b.split('').join(' ')}`;
}
