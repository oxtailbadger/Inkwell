import { describe, it, expect } from "vitest";
import { createLatestGuard } from "@/lib/latest";

describe("createLatestGuard", () => {
  it("a lone request is current", () => {
    const g = createLatestGuard();
    const t = g.next();
    expect(g.isCurrent(t)).toBe(true);
  });

  it("starting a newer request makes every earlier one stale", () => {
    const g = createLatestGuard();
    const first = g.next();
    const second = g.next();
    expect(g.isCurrent(first)).toBe(false);
    expect(g.isCurrent(second)).toBe(true);
  });

  it("the bug it prevents: a slow response for the first filter can't overwrite the second", async () => {
    // Simulates FeedClient: click tag A (slow request), then tag B (fast request)
    const g = createLatestGuard();
    let shown = "initial";
    const load = async (tag: string, delayMs: number) => {
      const token = g.next();
      await new Promise((r) => setTimeout(r, delayMs));
      if (!g.isCurrent(token)) return; // stale: ignore
      shown = tag;
    };
    await Promise.all([load("A", 40), load("B", 5)]);
    expect(shown).toBe("B");
  });

  it("without the guard the same race ends on the stale result (proves the test is real)", async () => {
    let shown = "initial";
    const load = async (tag: string, delayMs: number) => {
      await new Promise((r) => setTimeout(r, delayMs));
      shown = tag;
    };
    await Promise.all([load("A", 40), load("B", 5)]);
    expect(shown).toBe("A"); // the bug
  });

  it("current() lets 'load more' capture the filter it belongs to without invalidating anything", () => {
    const g = createLatestGuard();
    const load = g.next();
    const more = g.current();
    expect(more).toBe(load);
    expect(g.isCurrent(more)).toBe(true);
    g.next(); // the filter changes while 'load more' is in flight
    expect(g.isCurrent(more)).toBe(false); // so its page of results is dropped
  });
});
