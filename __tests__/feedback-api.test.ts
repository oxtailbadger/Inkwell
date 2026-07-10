import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

// Mirrors the route's one query shape: insert({ user_id, email, message }).
// insert() resolves directly ({ error }) — there's no .select()/.single()
// chain because the route doesn't read the row back.
function makeSupabaseMock({
  insertError = null as { message: string } | null,
  authed = true,
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authed ? mockUser : null } }),
    },
    from: vi.fn(() => ({ insert })),
    _mocks: { insert },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/feedback/route";

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/feedback", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await POST(makeRequest({ message: "great app" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when message is missing entirely", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a whitespace-only message", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest({ message: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message exceeds the max length", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest({ message: "x".repeat(4001) }));
    expect(res.status).toBe(400);
  });

  it("trims and inserts a valid message with the caller's id and email", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest({ message: "  please add search  " }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(supabase._mocks.insert).toHaveBeenCalledWith({
      user_id: mockUser.id,
      email: mockUser.email,
      message: "please add search",
    });
  });

  it("ignores any email supplied in the request body (email comes from the session)", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await POST(makeRequest({ message: "hi", email: "spoofed@evil.com", user_id: "someone-else" }));

    expect(supabase._mocks.insert).toHaveBeenCalledWith({
      user_id: mockUser.id,
      email: mockUser.email,
      message: "hi",
    });
  });

  it("returns a sanitized 500 (not the raw Postgres message) on insert failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        insertError: { message: 'insert on table "feedback" violates row-level security policy' },
      }) as never
    );
    const res = await POST(makeRequest({ message: "hi" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    // The friendly message may say "feedback"; what must never leak is the
    // raw Postgres detail (RLS internals, the violation phrasing).
    expect(body.error).not.toContain("row-level security");
    expect(body.error).not.toContain("violates");
  });
});
