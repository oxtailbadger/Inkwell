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
import { POST } from "@/app/api/fetch-og/route";
import { fetchOgCache } from "@/lib/server-cache";
import { _resetRateLimits } from "@/lib/rate-limit";

const realFetch = global.fetch;

function makeRequest(url?: string) {
  return new NextRequest("http://localhost/api/fetch-og", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(url ? { url } : {}),
  });
}

function microlinkSuccess(data: object) {
  return new Response(JSON.stringify({ status: "success", data }), { status: 200 });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchOgCache.clear();
  _resetRateLimits();
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
});

afterEach(() => {
  global.fetch = realFetch;
});

describe("POST /api/fetch-og", () => {
  it("maps a successful Microlink response to the article-metadata shape", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      microlinkSuccess({
        title: "A Great Read",
        description: "Interesting.",
        image: { url: "https://cdn.example.com/hero.jpg" },
        logo: { url: "https://cdn.example.com/logo.png" },
        publisher: "The Atlantic",
      })
    );
    const res = await POST(makeRequest("https://example.com/a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      title: "A Great Read",
      description: "Interesting.",
      image_url: "https://cdn.example.com/hero.jpg",
      site_name: "The Atlantic",
      site_icon_url: "https://cdn.example.com/logo.png",
    });
  });

  it("does NOT fall back to the logo as image_url when image is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      microlinkSuccess({ title: "T", logo: { url: "https://cdn.example.com/logo.png" } })
    );
    const res = await POST(makeRequest("https://example.com/a"));
    const body = await res.json();
    expect(body.image_url).toBeNull();
    expect(body.site_icon_url).toBe("https://cdn.example.com/logo.png");
  });

  it("treats Microlink's HTTP-200 status:fail as a failure (the documented gotcha)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "fail", code: "EFAILED", message: "nope" }), {
        status: 200,
      })
    );
    const res = await POST(makeRequest("https://example.com/a"));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.manual).toBe(false);
  });

  it("flags EPROXYNEEDED (antibot) responses as manual:true", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "fail", code: "EPROXYNEEDED" }), { status: 200 })
    );
    const res = await POST(makeRequest("https://www.nytimes.com/a"));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.manual).toBe(true);
  });

  it("returns 422 manual:false when the Microlink request itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const res = await POST(makeRequest("https://example.com/a"));
    expect(res.status).toBe(422);
  });

  it("serves a repeat request for the same URL from cache without re-fetching", async () => {
    global.fetch = vi.fn().mockResolvedValue(microlinkSuccess({ title: "Cached" }));
    await POST(makeRequest("https://example.com/same"));
    const res = await POST(makeRequest("https://example.com/same"));
    const body = await res.json();
    expect(body.title).toBe("Cached");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("caches EPROXYNEEDED blocks (stable per URL) but not transient failures", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "fail", code: "EPROXYNEEDED" }), { status: 200 })
    );
    await POST(makeRequest("https://www.nytimes.com/blocked"));
    const res = await POST(makeRequest("https://www.nytimes.com/blocked"));
    expect(res.status).toBe(422);
    expect((await res.json()).manual).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Transient failure: both calls hit Microlink
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "fail", code: "EFAILED" }), { status: 200 })
    );
    await POST(makeRequest("https://example.com/flaky"));
    await POST(makeRequest("https://example.com/flaky"));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns 429 with Retry-After past the per-user rate limit", async () => {
    global.fetch = vi.fn().mockResolvedValue(microlinkSuccess({ title: "T" }));
    // Distinct URLs so the cache can't absorb the calls; limit is 10/min
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest(`https://example.com/${i}`));
    }
    const res = await POST(makeRequest("https://example.com/eleventh"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });

  it("rate-limited requests still get cache hits", async () => {
    global.fetch = vi.fn().mockResolvedValue(microlinkSuccess({ title: "Popular" }));
    await POST(makeRequest("https://example.com/popular"));
    for (let i = 0; i < 9; i++) {
      await POST(makeRequest(`https://example.com/filler-${i}`));
    }
    // Limit exhausted, but the cached URL still resolves
    const res = await POST(makeRequest("https://example.com/popular"));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Popular");
  });

  it("returns 400 when no url is provided", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(false) as never);
    const res = await POST(makeRequest("https://example.com/a"));
    expect(res.status).toBe(401);
  });
});
