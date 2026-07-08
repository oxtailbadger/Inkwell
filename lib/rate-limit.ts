// Fixed-window, in-memory, per-user rate limiter.
//
// Deliberately NOT Upstash/Vercel KV (yet): that requires provisioning an
// external service. In-memory state is per serverless instance — counters
// reset on cold starts and aren't shared across concurrent instances — but
// for a ~10-user beta it covers the real threat, which is one user (or a
// script with their cookie) hammering the outbound-proxy routes and burning
// the Microlink quota or getting our IP range blocked by archive.ph: rapid
// repeats land on the same warm instance. If/when the app opens up, swap the
// Map here for a Redis-backed store — callers only see checkRateLimit().
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 2000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || now >= current.resetAt) {
    // Opportunistic cleanup so the map can't grow unbounded
    if (windows.size >= MAX_TRACKED_KEYS) {
      for (const [k, v] of windows) {
        if (now >= v.resetAt) windows.delete(k);
      }
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count < limit) {
    current.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

// Test helper — clears all windows so suites don't leak state into each other
export function _resetRateLimits() {
  windows.clear();
}
