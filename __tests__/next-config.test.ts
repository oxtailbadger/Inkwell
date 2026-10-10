import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

// The headers are config, so nothing exercises them in a unit test of app code
// — and a dropped line fails silently. This pins what ships; the live check
// (curl against `next start`) is how it was verified.

describe("next.config security headers", () => {
  it("applies one header set to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("sets the baseline headers", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));

    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toMatch(/camera=\(\)/);
    expect(byKey["Permissions-Policy"]).toMatch(/microphone=\(\)/);
    expect(byKey["Permissions-Policy"]).toMatch(/geolocation=\(\)/);
  });

  it("doesn't advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("doesn't set HSTS itself (Vercel owns it; a second value would drift)", async () => {
    const [{ headers }] = await nextConfig.headers!();
    expect(headers.map((h) => h.key.toLowerCase())).not.toContain("strict-transport-security");
  });
});
