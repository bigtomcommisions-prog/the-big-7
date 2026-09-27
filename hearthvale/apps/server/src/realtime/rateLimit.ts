/** Token bucket: `capacity` tokens, refilled continuously over `windowMs`. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(private capacity: number, private windowMs: number) {
    this.tokens = capacity;
  }

  take(n = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / this.windowMs) * this.capacity);
    this.last = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Keyed token buckets with idle eviction. */
export class KeyedLimiter {
  private buckets = new Map<string, { bucket: TokenBucket; used: number }>();

  constructor(private capacity: number, private windowMs: number) {}

  take(key: string): boolean {
    let e = this.buckets.get(key);
    if (!e) this.buckets.set(key, (e = { bucket: new TokenBucket(this.capacity, this.windowMs), used: 0 }));
    e.used = Date.now();
    if (this.buckets.size > 10_000) this.evict();
    return e.bucket.take();
  }

  private evict() {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [k, v] of this.buckets) if (v.used < cutoff) this.buckets.delete(k);
  }
}
