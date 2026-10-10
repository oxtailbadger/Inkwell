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
