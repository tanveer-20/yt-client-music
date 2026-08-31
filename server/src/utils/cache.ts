/**
 * Simple in-memory cache with TTL support.
 * Used to cache search results and stream URLs to reduce yt-dlp calls.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private defaultTtlMs: number = 5 * 60 * 1000) {
    // Cleanup expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    this.cleanup();
    return this.store.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Pre-configured caches
export const searchCache = new Cache<unknown>(5 * 60 * 1000);       // 5 min
export const streamCache = new Cache<unknown>(4 * 60 * 60 * 1000);  // 4 hours
export const infoCache = new Cache<unknown>(30 * 60 * 1000);        // 30 min
