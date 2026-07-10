import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

// Mirrors the route's one query shape:
// update({ display_name }).eq("id", user.id).select("display_name").single()
function makeSupabaseMock({
  resultRow = { display_name: "new-name" } as { display_name: string } | null,
  updateError = null as { message: string } | null,
  authed = true,
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: updateError ? null : resultRow, error: updateError });
  const selectAfterUpdate = vi.fn(() => ({ single }));
  const eqAfterUpdate = vi.fn(() => ({ select: selectAfterUpdate }));
  const update = vi.fn(() => ({ eq: eqAfterUpdate }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authed ? mockUser : null } }),
    },
    from: vi.fn(() => ({ update })),
    _mocks: { update, eq: eqAfterUpdate },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH } from "@/app/api/profile/route";

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/profile", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await PATCH(makeRequest({ display_name: "new-name" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when display_name is missing entirely", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty display_name (column is not-null, not a clear-field request)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ display_name: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when display_name exceeds the max length", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ display_name: "x".repeat(61) }));
    expect(res.status).toBe(400);
  });

  it("trims and saves a valid display_name, scoped to the caller", async () => {
    const supabase = makeSupabaseMock({ resultRow: { display_name: "priya" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(makeRequest({ display_name: "  priya  " }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ display_name: "priya" });
    expect(supabase._mocks.update).toHaveBeenCalledWith({ display_name: "priya" });
    expect(supabase._mocks.eq).toHaveBeenCalledWith("id", mockUser.id);
  });

  it("returns a sanitized 500 (not the raw Postgres message) on update failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        updateError: { message: 'update on table "profiles" violates row-level security policy' },
      }) as never
    );
    const res = await PATCH(makeRequest({ display_name: "priya" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("row-level security");
    expect(body.error).not.toContain("profiles");
  });
});
