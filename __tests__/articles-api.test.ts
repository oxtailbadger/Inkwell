import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUser = { id: "user-123", email: "test@example.com" };

const mockArticle = {
  id: "article-abc",
  url: "https://www.theatlantic.com/some-article",
  title: "A Great Read",
  description: "Very interesting stuff.",
  image_url: "https://cdn.theatlantic.com/thumb.jpg",
  site_name: "The Atlantic",
  tags: ["politics"],
  submitted_by: mockUser.id,
  created_at: new Date().toISOString(),
};

// Supabase query builder — chainable mock
function makeSupabaseMock({
  insertData = mockArticle,
  insertError = null,
  selectData = [mockArticle],
  selectError = null,
  // Ownership lookup DELETE performs before deleting (select("submitted_by").eq("id",...).maybeSingle())
  lookupData = { submitted_by: mockUser.id } as { submitted_by: string } | null,
  lookupError = null,
  deleteError = null,
  authed = true,
}: {
  insertData?: typeof mockArticle | null;
  insertError?: { message: string } | null;
  selectData?: typeof mockArticle[];
  selectError?: { message: string } | null;
  lookupData?: { submitted_by: string } | null;
  lookupError?: { message: string } | null;
  deleteError?: { message: string } | null;
  authed?: boolean;
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: insertData, error: insertError });
  const selectAfterInsert = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: selectAfterInsert }));

  // Articles listing chain: select("*").order(...).order(...).limit(...)[.contains(...)][.or(...)]
  // then awaited — a fluent object where every hop returns itself, thenable at the end.
  const articlesResult = { data: selectData, error: selectError };
  const chain: Record<string, unknown> = {};
  for (const method of ["order", "limit", "contains", "or", "not"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: typeof articlesResult) => void) =>
    Promise.resolve(articlesResult).then(resolve);
  const { order, contains } = chain as { order: ReturnType<typeof vi.fn>; contains: ReturnType<typeof vi.fn> };

  // .in() is used for the article_nod_counts / nods sub-queries — empty by default
  const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: lookupData, error: lookupError });
  // .eq() is shared by two different chains: DELETE's ownership lookup
  // (.eq("id",...).maybeSingle()) and the per-user nods query
  // (.eq("user_id",...).in(...)) — both methods live on the same returned
  // object since which one gets called depends on the test scenario.
  // .eq() also serves article_state's dismissed-exclusion pre-query
  // (.eq("user_id",...).eq("dismissed",true)) — empty by default, same as
  // the nods/article_nod_counts .in() branches below.
  const selectEq = vi.fn(() => ({ maybeSingle, in: inFn, eq: inFn }));
  const select = vi.fn(() => ({ ...chain, in: inFn, eq: selectEq }));

  const deleteEq2 = vi.fn().mockResolvedValue({ error: deleteError });
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authed ? mockUser : null },
      }),
    },
    from: vi.fn(() => ({ insert, select, delete: del })),
    _mocks: { insert, select, single, order, del, maybeSingle, limit: chain.limit as ReturnType<typeof vi.fn> },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { GET, POST, DELETE } from "@/app/api/articles/route";

function makeRequest(method: string, body?: object, params?: Record<string, string>) {
  const url = new URL(`http://localhost/api/articles${params ? "?" + new URLSearchParams(params) : ""}`);
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST /api/articles", () => {
  it("saves an article and returns 201 with the saved record", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const req = makeRequest("POST", {
      url: mockArticle.url,
      title: mockArticle.title,
      description: mockArticle.description,
      image_url: mockArticle.image_url,
      site_name: mockArticle.site_name,
      tags: mockArticle.tags,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe(mockArticle.id);
    expect(body.url).toBe(mockArticle.url);
    expect(body.title).toBe(mockArticle.title);

    // Verify insert was called with the right payload
    expect(supabase.from).toHaveBeenCalledWith("articles");
    expect(supabase._mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        url: mockArticle.url,
        submitted_by: mockUser.id,
        tags: mockArticle.tags,
      })
    );

    // Verify the GET query does NOT attempt to join auth.users
    const selectCall = (supabase._mocks.select.mock.calls as unknown[][])[0]?.[0] ?? "";
    expect(selectCall).not.toContain("submitter");
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await POST(makeRequest("POST", { url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no URL is provided", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest("POST", { title: "No URL here" }));
    expect(res.status).toBe(400);
  });

  it("returns a generic 500 message on DB failure, not the raw Postgres error", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ insertData: null, insertError: { message: "relation \"articles\" does not exist" } }) as never
    );
    const res = await POST(makeRequest("POST", { url: "https://example.com" }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("relation");
    expect(body.error).not.toContain("articles\" does not exist");
  });

  it("rejects a javascript: URL", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(makeRequest("POST", { url: "javascript:alert(1)" }));
    expect(res.status).toBe(400);
  });

  it("rejects an archive_url that isn't http(s)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(
      makeRequest("POST", { url: "https://example.com", archive_url: "data:text/html,evil" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a title over the length limit", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(
      makeRequest("POST", { url: "https://example.com", title: "x".repeat(501) })
    );
    expect(res.status).toBe(400);
  });

  it("rejects more than 12 tags", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(
      makeRequest("POST", { url: "https://example.com", tags: Array.from({ length: 13 }, (_, i) => `tag${i}`) })
    );
    expect(res.status).toBe(400);
  });

  it("lowercases tags server-side", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    await POST(makeRequest("POST", { url: "https://example.com", tags: ["POLITICS", "Tech"] }));
    expect(supabase._mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["politics", "tech"] })
    );
  });
});

describe("GET /api/articles", () => {
  it("returns a page of articles plus a pagination cursor for an authenticated user", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles[0].url).toBe(mockArticle.url);
    expect(body).toHaveProperty("nextCursor");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a cursor that can't be decoded", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest("GET", undefined, { cursor: "not-a-real-cursor" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("clamps an oversized limit to the maximum page size", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await GET(makeRequest("GET", undefined, { limit: "9999" }));
    expect(res.status).toBe(200);
    // limit+1 rows are requested to detect a next page — 50 (MAX_PAGE_SIZE) + 1, not 9999 + 1
    expect(supabase._mocks.limit).toHaveBeenCalledWith(51);
  });
});

describe("DELETE /api/articles", () => {
  it("deletes an article owned by the user", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await DELETE(makeRequest("DELETE", undefined, { id: mockArticle.id }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 400 when no id is provided", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the article doesn't exist", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ lookupData: null }) as never);
    const res = await DELETE(makeRequest("DELETE", undefined, { id: "does-not-exist" }));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it("returns 403 and does not delete when the article belongs to someone else", async () => {
    const supabase = makeSupabaseMock({ lookupData: { submitted_by: "someone-else" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await DELETE(makeRequest("DELETE", undefined, { id: mockArticle.id }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBeTruthy();
    // The delete call itself must never fire for a non-owner
    expect(supabase._mocks.del).not.toHaveBeenCalled();
  });
});
