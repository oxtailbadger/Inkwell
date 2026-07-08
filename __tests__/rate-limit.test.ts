import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, _resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  _resetRateLimits();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", 5, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit("k", 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("user-a", 5, 60_000);
    expect(checkRateLimit("user-a", 5, 60_000).allowed).toBe(false);
    expect(checkRateLimit("user-b", 5, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    expect(checkRateLimit("k", 5, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("k", 5, 60_000).allowed).toBe(true);
  });

  it("retryAfterSeconds shrinks as the window ages", () => {
    checkRateLimit("k", 1, 60_000);
    const early = checkRateLimit("k", 1, 60_000);
    vi.advanceTimersByTime(45_000);
    const late = checkRateLimit("k", 1, 60_000);
    expect(early.retryAfterSeconds).toBeGreaterThan(late.retryAfterSeconds);
    expect(late.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
