import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

// Mirrors the route's two query shapes:
// select("article_id").eq().eq().single()  — existence check
// delete().eq().eq() / insert()            — the toggle action
function makeSupabaseMock({
  existingNod = null as { article_id: string } | null,
  insertError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
  authed = true,
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: existingNod, error: null });
  const selectEq2 = vi.fn(() => ({ single }));
  const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
  const select = vi.fn(() => ({ eq: selectEq1 }));

  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));

  const insert = vi.fn().mockResolvedValue({ error: insertError });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authed ? mockUser : null } }),
    },
    from: vi.fn(() => ({ select, delete: del, insert })),
    _mocks: { insert, del },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/nods/route";

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/nods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/nods", () => {
  it("inserts a nod when none exists and returns nodded:true", async () => {
    const supabase = makeSupabaseMock({ existingNod: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest({ article_id: "article-abc" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ nodded: true });
    expect(supabase._mocks.insert).toHaveBeenCalledWith({
      article_id: "article-abc",
      user_id: mockUser.id,
    });
    expect(supabase._mocks.del).not.toHaveBeenCalled();
  });

  it("deletes the nod when one exists and returns nodded:false", async () => {
    const supabase = makeSupabaseMock({ existingNod: { article_id: "article-abc" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest({ article_id: "article-abc" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ nodded: false });
    expect(supabase._mocks.del).toHaveBeenCalled();
    expect(supabase._mocks.insert).not.toHaveBeenCalled();
  });

  it("returns a sanitized 500 (not the raw Postgres message) on insert failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ insertError: { message: 'insert or update on table "nods" violates foreign key constraint' } }) as never
    );
    const res = await POST(makeRequest({ article_id: "no-such-article" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("foreign key");
    expect(body.error).not.toContain("nods");
  });

  it("returns 400 when article_id is missing", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await POST(makeRequest({ article_id: "article-abc" }));
    expect(res.status).toBe(401);
  });
});
