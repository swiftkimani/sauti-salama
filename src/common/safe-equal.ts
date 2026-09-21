import { timingSafeEqual } from 'crypto';

/** Constant-time comparison for secrets. An empty expected value never matches. */
export function safeEqual(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || !expected) return false;
  const x = Buffer.from(given), y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}
