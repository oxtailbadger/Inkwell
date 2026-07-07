import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeSupabaseMock(exchangeError: { message: string } | null = null) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: exchangeError }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/auth/callback/route";

function makeRequest(params: Record<string, string>) {
  return new NextRequest(`http://localhost/api/auth/callback?${new URLSearchParams(params)}`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/auth/callback", () => {
  it("redirects to /feed by default after a successful code exchange", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest({ code: "abc123" }));
    expect(res.headers.get("location")).toBe("http://localhost/feed");
  });

  it("honors a safe relative next path", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest({ code: "abc123", next: "/feed?tag=tech" }));
    expect(res.headers.get("location")).toBe("http://localhost/feed?tag=tech");
  });

  it("falls back to /feed for a protocol-relative next value", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest({ code: "abc123", next: "//evil.com" }));
    expect(res.headers.get("location")).toBe("http://localhost/feed");
  });

  it("falls back to /feed for a next value without a leading slash", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest({ code: "abc123", next: "@evil.com" }));
    expect(res.headers.get("location")).toBe("http://localhost/feed");
  });

  it("falls back to /feed for an absolute URL next value", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest({ code: "abc123", next: "https://evil.com" }));
    expect(res.headers.get("location")).toBe("http://localhost/feed");
  });

  it("redirects to /login on exchange failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ message: "invalid code" }) as never
    );
    const res = await GET(makeRequest({ code: "bad-code" }));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=auth");
  });

  it("redirects to /login when no code is present", async () => {
    const res = await GET(makeRequest({}));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=auth");
  });
});
