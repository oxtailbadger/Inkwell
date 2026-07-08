// Small in-memory TTL cache for outbound-API results. Same per-instance
// caveat as lib/rate-limit.ts (and same upgrade path: swap for Redis when
// the app outgrows a single-digit user count) — but even per-instance, this
// meaningfully cuts Microlink quota burn: re-previewing the same URL, or two
// friends sharing the same article in a session, no longer re-hits the API.

export class TTLCache<V> {
  private map = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private maxEntries: number,
    private ttlMs: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // Simple insertion-order eviction: Maps iterate oldest-first, so dropping
    // the first key bounds memory without LRU bookkeeping
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}

// Cached fetch-og responses keyed by article URL. Stores status+body so both
// successes (200) and stable antibot blocks (422 + manual:true, e.g. NYT via
// EPROXYNEEDED) are served from cache — both are deterministic per URL.
// Transient Microlink failures are NOT cached (see the route).
export const fetchOgCache = new TTLCache<{ status: number; body: object }>(
  500,
  24 * 60 * 60 * 1000
);

// Cached archive.today lookups keyed by article URL — found=true only.
// A found snapshot is permanent; found=false may flip as soon as someone
// archives the page, so negative results always re-check.
export const archiveCheckCache = new TTLCache<{ archive_url: string }>(
  500,
  24 * 60 * 60 * 1000
);
