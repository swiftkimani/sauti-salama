/**
 * In-memory sliding-window limiter keyed by a phone hash. Enough for a single-instance proof of concept;
 * a multi-instance deployment would keep the same interface on Redis.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly limit: () => number, private readonly windowMs: () => number) {}

  /** Records an attempt. Returns false when the key has already used its allowance for the window. A limit of 0 disables limiting. */
  take(key: string, now = Date.now()): boolean {
    const limit = this.limit();
    if (!(limit > 0)) return true;
    const window = this.windowMs();
    const recent = (this.hits.get(key) || []).filter((t) => now - t < window);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.sweep(now, window);
    return true;
  }

  private sweep(now: number, window: number): void {
    for (const [key, times] of this.hits) if (!times.some((t) => now - t < window)) this.hits.delete(key);
  }
}
