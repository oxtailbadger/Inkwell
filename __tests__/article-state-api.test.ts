import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

// Mirrors the route's one query shape:
// upsert({ article_id, user_id, [column]: value }, { onConflict }).select(...).single()
function makeSupabaseMock({
  resultRow = { article_id: "article-abc", saved: false, read: false, dismissed: false } as
    | { article_id: string; saved: boolean; read: boolean; dismissed: boolean }
    | null,
  upsertError = null as { message: string } | null,
  authed = true,
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: upsertError ? null : resultRow, error: upsertError });
  const selectAfterUpsert = vi.fn(() => ({ single }));
  const upsert = vi.fn(() => ({ select: selectAfterUpsert }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authed ? mockUser : null } }),
    },
    from: vi.fn(() => ({ upsert })),
    _mocks: { upsert },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { PATCH } from "@/app/api/article-state/route";

function makeRequest(body?: object) {
  return new NextRequest("http://localhost/api/article-state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/article-state", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await PATCH(makeRequest({ article_id: "a1", action: "save" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when article_id is missing", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ action: "save" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognized action", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ article_id: "a1", action: "archive" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is missing entirely", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ article_id: "a1" }));
    expect(res.status).toBe(400);
  });

  const cases: [string, string, boolean][] = [
    ["save", "saved", true],
    ["unsave", "saved", false],
    ["read", "read", true],
    ["unread", "read", false],
    ["dismiss", "dismissed", true],
    ["undismiss", "dismissed", false],
  ];

  for (const [action, column, value] of cases) {
    it(`"${action}" upserts { ${column}: ${value} } for the caller`, async () => {
      const supabase = makeSupabaseMock();
      vi.mocked(createClient).mockResolvedValue(supabase as never);

      const res = await PATCH(makeRequest({ article_id: "article-abc", action }));
      expect(res.status).toBe(200);
      // updated_at must be in every upsert payload — a partial upsert
      // doesn't touch columns it omits, so the DB default alone would
      // leave it frozen at first-insert time
      expect(supabase._mocks.upsert).toHaveBeenCalledWith(
        { article_id: "article-abc", user_id: mockUser.id, [column]: value, updated_at: expect.any(String) },
        { onConflict: "article_id,user_id" }
      );
    });
  }

  it("returns the full resulting state row on success", async () => {
    const supabase = makeSupabaseMock({
      resultRow: { article_id: "article-abc", saved: true, read: false, dismissed: false },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(makeRequest({ article_id: "article-abc", action: "save" }));
    const body = await res.json();
    expect(body).toEqual({ article_id: "article-abc", saved: true, read: false, dismissed: false });
  });

  it("returns a sanitized 500 (not the raw Postgres message) on upsert failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        upsertError: { message: 'insert or update on table "article_state" violates foreign key constraint' },
      }) as never
    );
    const res = await PATCH(makeRequest({ article_id: "no-such-article", action: "save" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("foreign key");
    expect(body.error).not.toContain("article_state");
  });
});
