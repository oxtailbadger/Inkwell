import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ARTICLE_ID, BAD_IDS, NON_OBJECT_BODIES, OTHER_ID, rawRequest } from "./helpers/requests";

const mockUser = { id: "user-123", email: "test@example.com" };

const mockArticle = {
  id: ARTICLE_ID,
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
  insertError = null as { message: string; code?: string; details?: string } | null,
  selectData = [mockArticle],
  selectError = null,
  // Ownership lookup DELETE performs before deleting (select("submitted_by").eq("id",...).maybeSingle())
  lookupData = { submitted_by: mockUser.id } as { submitted_by: string } | null,
  lookupError = null,
  deleteError = null,
  authed = true,
  // What find_shared_article() returns when a duplicate link is rejected
  sharedLookup = { data: [] as object[] | null, error: null as { message: string } | null },
}: {
  insertData?: typeof mockArticle | null;
  insertError?: { message: string; code?: string; details?: string } | null;
  selectData?: typeof mockArticle[];
  selectError?: { message: string } | null;
  lookupData?: { submitted_by: string } | null;
  lookupError?: { message: string } | null;
  deleteError?: { message: string } | null;
  authed?: boolean;
  sharedLookup?: { data: object[] | null; error: { message: string } | null };
} = {}) {
  const single = vi.fn().mockResolvedValue({ data: insertData, error: insertError });
  const selectAfterInsert = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: selectAfterInsert }));

  // The feed page comes from the feed_articles() Postgres function (all
  // filtering is in SQL — see supabase/launch-hardening.sql), so the listing is
  // an rpc() call rather than a chained query on `articles`.
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      name === "find_shared_article"
        ? { data: sharedLookup.data, error: sharedLookup.error }
        : { data: selectData, error: selectError }
    )
  );

  // .in() is used for the article_nod_counts / nods sub-queries — empty by default
  const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: lookupData, error: lookupError });
  // .eq() is shared by two different chains: DELETE's ownership lookup
  // (.eq("id",...).maybeSingle()) and the per-user nods query
  // (.eq("user_id",...).in(...)) — both methods live on the same returned
  // object since which one gets called depends on the test scenario.
  // The per-page article_state merge is (.eq("user_id",...).in(...)) —
  // empty by default, same as the nods/article_nod_counts .in() branches.
  const selectEq = vi.fn(() => ({ maybeSingle, in: inFn, eq: inFn }));
  const select = vi.fn(() => ({ in: inFn, eq: selectEq }));

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
    rpc,
    _mocks: { insert, select, single, del, maybeSingle, rpc },
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
    expect(supabase._mocks.rpc).toHaveBeenCalledWith(
      "feed_articles",
      expect.objectContaining({ p_limit: 51 })
    );
  });

  it("forwards the tag and state filters to the database function", async () => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    await GET(makeRequest("GET", undefined, { tag: "tech", saved: "1", read: "1", dismissed: "1" }));
    expect(supabase._mocks.rpc).toHaveBeenCalledWith(
      "feed_articles",
      expect.objectContaining({ p_tag: "tech", p_saved: true, p_read: true, p_dismissed: true })
    );
  });

  describe("?section=", () => {
    const args = (supabase: ReturnType<typeof makeSupabaseMock>) =>
      (supabase._mocks.rpc.mock.calls as unknown as [string, Record<string, unknown>][])[0][1];

    it("sends no p_section for Articles, so it works before supabase/sections.sql is run", async () => {
      for (const query of [undefined, { section: "articles" }]) {
        const supabase = makeSupabaseMock();
        vi.mocked(createClient).mockResolvedValue(supabase as never);
        expect((await GET(makeRequest("GET", undefined, query))).status).toBe(200);
        expect("p_section" in args(supabase)).toBe(false);
      }
    });

    it("asks the database for the Podcasts section", async () => {
      const supabase = makeSupabaseMock();
      vi.mocked(createClient).mockResolvedValue(supabase as never);
      expect((await GET(makeRequest("GET", undefined, { section: "podcasts", saved: "1" }))).status).toBe(200);
      expect(args(supabase)).toEqual(expect.objectContaining({ p_section: "podcasts", p_saved: true }));
    });

    it.each(["videos", "", "PODCASTS", "podcast", "articles,podcasts"])("rejects the unknown section %j with 400", async (section) => {
      const supabase = makeSupabaseMock();
      vi.mocked(createClient).mockResolvedValue(supabase as never);
      const res = await GET(makeRequest("GET", undefined, { section }));
      expect(res.status).toBe(400);
      expect(supabase._mocks.rpc).not.toHaveBeenCalled();
    });
  });

  it("returns 500 with a friendly message when the database function fails", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({ selectError: { message: "function public.feed_articles does not exist" } }) as never
    );
    const res = await GET(makeRequest("GET"));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("feed_articles");
  });

  it("reads ?saved=1 and returns a valid (possibly empty) page rather than erroring", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest("GET", undefined, { saved: "1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body).toHaveProperty("nextCursor");
  });

  it("reads ?read=1 and returns a valid (possibly empty) page rather than erroring", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest("GET", undefined, { read: "1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.articles)).toBe(true);
  });

  it("reads ?dismissed=1 and returns a valid (possibly empty) page rather than erroring", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await GET(makeRequest("GET", undefined, { dismissed: "1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.articles)).toBe(true);
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
    const res = await DELETE(makeRequest("DELETE", undefined, { id: OTHER_ID }));
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

describe("POST /api/articles — malformed requests", () => {
  it.each(NON_OBJECT_BODIES)("returns 400 (not 500) for %s", async (_label, raw) => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never);
    const res = await POST(rawRequest("http://localhost/api/articles", "POST", raw));
    expect(res.status).toBe(400);
  });

  it("answers 401 before looking at the body", async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ authed: false }) as never);
    const res = await POST(rawRequest("http://localhost/api/articles", "POST", "{not json"));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/articles — id validation", () => {
  it.each(BAD_IDS.filter(([, v]) => typeof v === "string"))("returns 400 for an id that is %s, without a lookup", async (_label, value) => {
    const supabase = makeSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await DELETE(makeRequest("DELETE", undefined, { id: value as string }));
    expect(res.status).toBe(400);
    expect(supabase._mocks.maybeSingle).not.toHaveBeenCalled();
    expect(supabase._mocks.del).not.toHaveBeenCalled();
  });
});

describe("POST /api/articles — a link that was already shared", () => {
  // What Postgres reports when the unique index on url_canonical rejects the insert
  const duplicate = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "articles_url_canonical_key"',
    details: "Key (url_canonical)=(https://theatlantic.com/some-article) already exists.",
  };
  const body = { url: "https://www.theatlantic.com/some-article?utm_source=x" };
  const shared = (over: object = {}) => ({
    id: OTHER_ID,
    title: "A Great Read",
    submitted_by: "someone-else",
    shared_by: "Priya",
    created_at: "2026-07-01T00:00:00Z",
    ...over,
  });

  it("returns 409 naming who already shared it, and pointing at Nod instead", async () => {
    const supabase = makeSupabaseMock({ insertData: null, insertError: duplicate, sharedLookup: { data: [shared()], error: null } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(makeRequest("POST", body));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("Priya already shared this link — find it in the feed and give it a Nod instead.");
    expect(json.existing).toEqual({ id: OTHER_ID, title: "A Great Read", shared_by: "Priya", is_you: false });
    // it asks the DATABASE which article matches — the app never canonicalizes URLs itself
    expect(supabase._mocks.rpc).toHaveBeenCalledWith("find_shared_article", { p_url: body.url });
  });

  it("says 'You already shared this link' when it was the same person", async () => {
    const supabase = makeSupabaseMock({
      insertData: null,
      insertError: duplicate,
      sharedLookup: { data: [shared({ submitted_by: mockUser.id, shared_by: "me" })], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const json = await (await POST(makeRequest("POST", body))).json();
    expect(json.error).toBe("You already shared this link.");
    expect(json.existing.is_you).toBe(true);
  });

  it("falls back to a generic-but-helpful 409 if the lookup fails or finds nothing", async () => {
    for (const sharedLookup of [
      { data: null, error: { message: "function find_shared_article does not exist" } },
      { data: [], error: null },
    ]) {
      vi.mocked(createClient).mockResolvedValue(
        makeSupabaseMock({ insertData: null, insertError: duplicate, sharedLookup }) as never
      );
      const res = await POST(makeRequest("POST", body));
      const json = await res.json();
      expect(res.status).toBe(409);
      expect(json.error).toMatch(/already been shared/i);
      expect(json.error).not.toMatch(/function|does not exist/i);
      expect(json.existing).toBeNull();
    }
  });

  it("does not treat an unrelated unique violation as a duplicate link", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        insertData: null,
        insertError: { code: "23505", message: 'duplicate key value violates unique constraint "articles_pkey"' },
      }) as never
    );
    const res = await POST(makeRequest("POST", body));
    expect(res.status).toBe(500);
  });

  it("does not treat a non-unique-violation that merely mentions the index as a duplicate", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock({
        insertData: null,
        insertError: { code: "42501", message: 'permission denied for index "articles_url_canonical_key"' },
      }) as never
    );
    expect((await POST(makeRequest("POST", body))).status).toBe(500);
  });
});

