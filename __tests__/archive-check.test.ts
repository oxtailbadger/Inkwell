import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

function makeSupabaseMock(authed = true) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authed ? mockUser : null },
      }),
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/archive-check/route";

const realFetch = global.fetch;

function makeRequest(url?: string) {
  const target = new URL(
    `http://localhost/api/archive-check${url ? `?url=${encodeURIComponent(url)}` : ""}`
  );
  return new NextRequest(target);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
});

afterEach(() => {
  global.fetch = realFetch;
});

describe("GET /api/archive-check", () => {
  it("returns the snapshot URL when archive.today redirects", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://archive.ph/AbCd3" } })
    );
    const res = await GET(makeRequest("https://www.nytimes.com/article"));
    const body = await res.json();
    expect(body).toEqual({ found: true, archive_url: "https://archive.ph/AbCd3" });
  });

  it("resolves a relative redirect against archive.ph", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "/AbCd3" } })
    );
    const res = await GET(makeRequest("https://example.com/a"));
    const body = await res.json();
    expect(body.archive_url).toBe("https://archive.ph/AbCd3");
  });

  it("returns found:false when there is no snapshot (404)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    const res = await GET(makeRequest("https://example.com/nothing"));
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns found:false when the lookup throws (blocked or timeout)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    const res = await GET(makeRequest("https://example.com/a"));
    const body = await res.json();
    expect(body).toEqual({ found: false });
  });

  it("returns 400 when no url is provided", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(false) as never);
    const res = await GET(makeRequest("https://example.com/a"));
    expect(res.status).toBe(401);
  });
});
