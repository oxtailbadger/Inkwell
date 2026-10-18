import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ARTICLE_ID, BAD_IDS, NON_OBJECT_BODIES, OTHER_ID, rawRequest } from "./helpers/requests";

const mockUser = { id: "user-123", email: "test@example.com" };

// Mirrors the route's one query shape:
// upsert({ article_id, user_id, [column]: value }, { onConflict }).select(...).single()
function makeSupabaseMock({
  resultRow = { article_id: ARTICLE_ID, saved: false, read: false, dismissed: false } as
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
    const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action: "save" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when article_id is missing", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ action: "save" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unrecognized action", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action: "archive" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is missing entirely", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ article_id: ARTICLE_ID }));
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

      const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action }));
      expect(res.status).toBe(200);
      // updated_at must be in every upsert payload — a partial upsert
      // doesn't touch columns it omits, so the DB default alone would
      // leave it frozen at first-insert time
      expect(supabase._mocks.upsert).toHaveBeenCalledWith(
        { article_id: ARTICLE_ID, user_id: mockUser.id, [column]: value, updated_at: expect.any(String) },
        { onConflict: "article_id,user_id" }
      );
    });
  }

  it("returns the full resulting state row on success", async () => {
    const supabase = makeSupabaseMock({
      resultRow: { article_id: ARTICLE_ID, saved: true, read: false, dismissed: false },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action: "save" }));
    const body = await res.json();
    expect(body).toEqual({ article_id: ARTICLE_ID, saved: true, read: false, dismissed: false });
  });

  it("returns a sanitized 500 (not the raw Postgres message) on upsert failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        upsertError: { message: 'insert or update on table "article_state" violates foreign key constraint' },
      }) as never
    );
    const res = await PATCH(makeRequest({ article_id: OTHER_ID, action: "save" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("foreign key");
    expect(body.error).not.toContain("article_state");
  });

  it.each(NON_OBJECT_BODIES)("returns 400 (not 500) for %s", async (_label, raw) => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(rawRequest("http://localhost/api/article-state", "PATCH", raw));
    expect(res.status).toBe(400);
  });

  it.each(BAD_IDS)("returns 400 for article_id that is %s, without touching the database", async (_label, value) => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(makeRequest({ article_id: value, action: "save" } as never));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // `ACTIONS[action]` on a plain object resolves these to inherited functions,
  // which are truthy — they used to slip past the "is it a known action" check
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"])(
    "rejects the inherited-property name %j as an action",
    async (action) => {
      const supabase = makeSupabaseMock();
      vi.mocked(createClient).mockResolvedValue(supabase as never);
      const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action }));
      expect(res.status).toBe(400);
      expect(supabase.from).not.toHaveBeenCalled();
    }
  );

  it.each([[42], [null], [["save"]], [{ a: 1 }]])("rejects the non-string action %j", async (action) => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await PATCH(makeRequest({ article_id: ARTICLE_ID, action } as never));
    expect(res.status).toBe(400);
  });
});
