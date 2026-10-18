import { describe, it, expect } from "vitest";
import { formatShareDate } from "@/lib/format-date";

describe("formatShareDate", () => {
  it("formats as 'Mon D, YYYY' in the locale-independent en-US style", () => {
    expect(formatShareDate("2026-07-01T12:00:00Z", "UTC")).toBe("Jul 1, 2026");
    expect(formatShareDate("2026-12-25T12:00:00Z", "UTC")).toBe("Dec 25, 2026");
  });

  it("is deterministic for a pinned timezone, so server and client agree during hydration", () => {
    const a = formatShareDate("2026-07-01T02:30:00Z", "UTC");
    const b = formatShareDate("2026-07-01T02:30:00Z", "UTC");
    expect(a).toBe(b);
    expect(a).toBe("Jul 1, 2026");
  });

  it("shows the viewer's own calendar day when given their timezone — the server/client difference the old code tripped on", () => {
    // 02:30 UTC on Jul 1 is still the evening of Jun 30 in Los Angeles
    expect(formatShareDate("2026-07-01T02:30:00Z", "UTC")).toBe("Jul 1, 2026");
    expect(formatShareDate("2026-07-01T02:30:00Z", "America/Los_Angeles")).toBe("Jun 30, 2026");
    expect(formatShareDate("2026-07-01T02:30:00Z", "Pacific/Auckland")).toBe("Jul 1, 2026");
  });

  it("uses the runtime timezone when none is given (what the browser passes)", () => {
    expect(formatShareDate("2026-07-01T12:00:00Z")).toMatch(/^(Jun 30|Jul 1|Jul 2), 2026$/);
  });

  it.each(["", "not a date", "2026-13-45"])("returns an empty string for %j, never the text 'Invalid Date'", (bad) => {
    expect(formatShareDate(bad, "UTC")).toBe("");
  });

  it("accepts the timestamp shape Supabase returns (offset + microseconds)", () => {
    expect(formatShareDate("2026-07-09T21:15:00.797047+00:00", "UTC")).toBe("Jul 9, 2026");
  });
});
