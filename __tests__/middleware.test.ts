import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// updateSession builds a Supabase server client from request cookies and asks
// it who the caller is; the only thing under test is what it does with the
// answer, so the client is reduced to auth.getUser().
const getUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser } })),
}));

import { updateSession } from "@/lib/supabase/middleware";

function req(path: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, { method });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { user: null } });
}
function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("updateSession — signed out", () => {
  it("redirects protected pages to /login", async () => {
    signedOut();
    const res = await updateSession(req("/feed"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  describe("remembers where a signed-out visitor was headed, so signing in lands them there", () => {
    const loc = async (path: string) => {
      signedOut();
      const res = await updateSession(req(path));
      expect(res.status).toBe(307);
      const u = new URL(res.headers.get("location")!);
      return { path: u.pathname, next: u.searchParams.get("next"), search: u.search };
    };

    it("a link shared from the phone's share sheet survives the trip through /login", async () => {
      const shared = "/share?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1&text=hi";
      expect(await loc(shared)).toMatchObject({ path: "/login", next: shared });
    });

    it("/feed?share=… is remembered too (what /share itself redirects to)", async () => {
      const dest = "/feed?share=https%3A%2F%2Fexample.com%2Fa";
      expect(await loc(dest)).toMatchObject({ path: "/login", next: dest });
    });

    it("other pages are remembered", async () => {
      expect(await loc("/profile")).toMatchObject({ path: "/login", next: "/profile" });
    });

    it("plain /feed and the root add nothing — they're the default anyway", async () => {
      expect(await loc("/feed")).toMatchObject({ path: "/login", search: "" });
      expect(await loc("/")).toMatchObject({ path: "/login", search: "" });
    });

    it("does not carry the original query string onto /login (only the encoded next)", async () => {
      const r = await loc("/feed?tag=tech&saved=1");
      expect(r.next).toBe("/feed?tag=tech&saved=1");
      expect(new URL("https://x.test/login" + r.search).searchParams.has("tag")).toBe(false);
    });
  });

  it("returns 401 JSON (not a redirect) for API routes, so fetch() callers can act on it", async () => {
    signedOut();
    const res = await updateSession(req("/api/nods", "POST"));
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 JSON for every protected API route, not just one", async () => {
    signedOut();
    for (const path of [
      "/api/articles",
      "/api/article-state",
      "/api/profile",
      "/api/feedback",
      "/api/fetch-og",
      "/api/archive-check",
      "/api/author-articles",
    ]) {
      const res = await updateSession(req(path));
      expect(res.status, path).toBe(401);
    }
  });

  it.each(["/api/author-articles", "/api/authorize", "/login-help", "/signups"])(
    "does not treat lookalike path %s as public (whole segments, not string prefixes)",
    async (path) => {
      signedOut();
      const res = await updateSession(req(path));
      expect(res.status).not.toBe(200);
    }
  );

  it.each(["/login", "/signup", "/api/auth/callback"])(
    "lets %s through without a session",
    async (path) => {
      signedOut();
      const res = await updateSession(req(path));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  );
});

describe("updateSession — signed in", () => {
  it.each(["/feed", "/profile", "/api/articles"])("lets %s through", async (path) => {
    signedIn();
    const res = await updateSession(req(path));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
