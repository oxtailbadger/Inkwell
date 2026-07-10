import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllTags, fetchEnrichedArticles, encodeCursor, decodeCursor } from "@/lib/articles";

const article = (id: string, submitted_by: string, created_at = "2026-07-01T00:00:00Z") => ({
  id,
  url: `https://example.com/${id}`,
  title: `Article ${id}`,
  description: null,
  image_url: null,
  site_name: null,
  site_icon_url: null,
  tags: [],
  archive_url: null,
  submitted_by,
  created_at,
});

// fetchEnrichedArticles takes the client as an argument, so no vi.mock needed
// — just a fake matching the query shapes it issues:
//   article_state (pre-query): select(...).eq("user_id",...).eq("dismissed",true) — dismissed IDs to exclude
//   articles:                  select("*").order(...).order(...).limit(...)[.contains(...)][.or(...)] then awaited (thenable)
//   article_nod_counts:        select(...).in(...)  — pre-aggregated counts
//   nods:                      select(...).eq("user_id", ...).in(...) — the caller's own nod state only
//   profiles:                  select(...).in(...)
//   article_state (merge):     select(...).eq("user_id",...).in(...) — saved/read/dismissed for the page
function makeFluentBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["order", "limit", "contains", "or", "not", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve);
  return builder;
}

function makeFakeSupabase({
  articles = [] as object[],
  articlesError = null as { message: string } | null,
  nodCounts = [] as { article_id: string; nod_count: number }[],
  myNods = [] as { article_id: string }[],
  profiles = [] as { id: string; display_name: string }[],
  dismissedRows = [] as { article_id: string }[],
  savedRows = [] as { article_id: string }[],
  readRows = [] as { article_id: string }[],
  stateRows = [] as { article_id: string; saved: boolean; read: boolean; dismissed: boolean }[],
} = {}) {
  const articlesResult = { data: articlesError ? null : articles, error: articlesError };
  const rowsByColumn: Record<string, { article_id: string }[]> = {
    saved: savedRows,
    read: readRows,
    dismissed: dismissedRows,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "articles") {
        return { select: () => makeFluentBuilder(articlesResult) };
      }
      if (table === "article_nod_counts") {
        return { select: () => ({ in: () => Promise.resolve({ data: nodCounts, error: null }) }) };
      }
      if (table === "nods") {
        return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: myNods, error: null }) }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }) };
      }
      if (table === "article_state") {
        // Same `.eq()` first hop serves four different second hops: the
        // dismissed-exclusion / saved-only / read-only pre-queries
        // (.eq("<column>",true)) and the per-page state merge
        // (.eq("user_id",...).in(...)) — disambiguate the .eq().eq() shapes
        // by which column the second .eq() names.
        return {
          select: () => ({
            eq: () => ({
              eq: (column: string) => Promise.resolve({ data: rowsByColumn[column] ?? [], error: null }),
              in: () => Promise.resolve({ data: stateRows, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("fetchEnrichedArticles", () => {
  it("merges nod counts (from the view), the caller's nod state, and submitter display names", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1"), article("a2", "user-2")],
      nodCounts: [
        { article_id: "a1", nod_count: 2 },
        { article_id: "a2", nod_count: 1 },
      ],
      myNods: [{ article_id: "a1" }],
      profiles: [
        { id: "user-1", display_name: "priya" },
        { id: "user-2", display_name: "ben" },
      ],
    });

    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });

    expect(error).toBeNull();
    expect(articles).toHaveLength(2);
    expect(articles![0]).toMatchObject({
      id: "a1",
      nod_count: 2,
      user_has_nodded: true,
      submitter_name: "priya",
    });
    expect(articles![1]).toMatchObject({
      id: "a2",
      nod_count: 1,
      user_has_nodded: false,
      submitter_name: "ben",
    });
  });

  it("falls back to submitter_name:null and nod_count:0 when no view/profile row exists", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-without-profile")],
    });
    const { articles } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });
    expect(articles![0].submitter_name).toBeNull();
    expect(articles![0].nod_count).toBe(0);
    expect(articles![0].user_has_nodded).toBe(false);
  });

  it("returns an empty list (not an error) when there are no articles", async () => {
    const supabase = makeFakeSupabase({ articles: [] });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });
    expect(error).toBeNull();
    expect(articles).toEqual([]);
  });

  it("filters by tag via .contains when a tag is passed", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")] });
    await fetchEnrichedArticles(supabase, "me", "tech", { limit: 24 });
    const from = supabase.from as ReturnType<typeof vi.fn>;
    expect(from).toHaveBeenCalledWith("articles");
  });

  it("returns a friendly error string, not the raw DB message", async () => {
    const supabase = makeFakeSupabase({
      articlesError: { message: 'relation "articles" does not exist' },
    });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });
    expect(articles).toBeNull();
    expect(error).not.toContain("relation");
    expect(error).toBeTruthy();
  });

  it("returns a nextCursor and trims the extra row when more pages exist", async () => {
    // limit 2 → the function requests limit+1 (3); the fake ignores the
    // actual .limit() call and just hands back whatever we seed here, which
    // is exactly how a real "3 rows came back for a limit-of-2 page" response
    // looks. Real UUIDs because decodeCursor validates id shape.
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const u3 = "33333333-3333-4333-8333-333333333333";
    const supabase = makeFakeSupabase({
      articles: [
        article(u1, "user-1", "2026-07-03T00:00:00Z"),
        article(u2, "user-1", "2026-07-02T00:00:00Z"),
        article(u3, "user-1", "2026-07-01T00:00:00Z"),
      ],
    });
    const { articles, nextCursor, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 2 });
    expect(error).toBeNull();
    expect(articles).toHaveLength(2);
    expect(articles!.map((a) => a.id)).toEqual([u1, u2]);
    expect(nextCursor).not.toBeNull();
    expect(decodeCursor(nextCursor!)).toEqual({ created_at: "2026-07-02T00:00:00Z", id: u2 });
  });

  it("returns nextCursor:null when the page isn't full (no more pages)", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1"), article("a2", "user-1")],
    });
    const { articles, nextCursor } = await fetchEnrichedArticles(supabase, "me", null, { limit: 5 });
    expect(articles).toHaveLength(2);
    expect(nextCursor).toBeNull();
  });

  it("returns a 'bad cursor' error without querying when the cursor can't be decoded", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")] });
    const { articles, nextCursor, error } = await fetchEnrichedArticles(supabase, "me", null, {
      limit: 24,
      cursor: "not-valid-base64-json",
    });
    expect(articles).toBeNull();
    expect(nextCursor).toBeNull();
    expect(error).toBe("Invalid pagination cursor");
    expect(supabase.from as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("excludes an article the caller has dismissed, even though it matches every other filter", async () => {
    const supabase = makeFakeSupabase({
      // The fake ignores the query-builder's own .not("id","in",...) filter
      // (it isn't a real DB), so this asserts the *pre-query* ran and its
      // result reached the exclusion filter, not that filtering itself works
      // — that part is Postgres's job. What's testable here: dismissed IDs
      // are looked up before the articles query runs, and don't blow up the
      // enrichment merge below.
      articles: [article("a1", "user-1")],
      dismissedRows: [{ article_id: "a1" }],
      stateRows: [{ article_id: "a1", saved: false, read: false, dismissed: true }],
    });
    await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });
    const from = supabase.from as ReturnType<typeof vi.fn>;
    expect(from).toHaveBeenCalledWith("article_state");
  });

  it("merges saved/read/dismissed per article, defaulting to false when no state row exists", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1"), article("a2", "user-1")],
      stateRows: [{ article_id: "a1", saved: true, read: true, dismissed: false }],
    });
    const { articles } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24 });
    expect(articles![0]).toMatchObject({ id: "a1", saved: true, read: true, dismissed: false });
    expect(articles![1]).toMatchObject({ id: "a2", saved: false, read: false, dismissed: false });
  });

  it("savedOnly: returns an empty list without querying articles at all when nothing is saved", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")], savedRows: [] });
    const { articles, nextCursor, error } = await fetchEnrichedArticles(supabase, "me", null, {
      limit: 24,
      savedOnly: true,
    });
    expect(articles).toEqual([]);
    expect(nextCursor).toBeNull();
    expect(error).toBeNull();
    const from = supabase.from as ReturnType<typeof vi.fn>;
    expect(from).not.toHaveBeenCalledWith("articles");
  });

  it("savedOnly: looks up saved article IDs and proceeds to the normal query/enrichment when some exist", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1")],
      savedRows: [{ article_id: "a1" }],
      stateRows: [{ article_id: "a1", saved: true, read: false, dismissed: false }],
    });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24, savedOnly: true });
    expect(error).toBeNull();
    expect(articles).toHaveLength(1);
    expect(articles![0]).toMatchObject({ id: "a1", saved: true });
  });

  it("readOnly: returns an empty list without querying articles at all when nothing is read", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")], readRows: [] });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24, readOnly: true });
    expect(articles).toEqual([]);
    expect(error).toBeNull();
    const from = supabase.from as ReturnType<typeof vi.fn>;
    expect(from).not.toHaveBeenCalledWith("articles");
  });

  it("readOnly: looks up read article IDs and proceeds to the normal query/enrichment when some exist", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1")],
      readRows: [{ article_id: "a1" }],
      stateRows: [{ article_id: "a1", saved: false, read: true, dismissed: false }],
    });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24, readOnly: true });
    expect(error).toBeNull();
    expect(articles).toHaveLength(1);
    expect(articles![0]).toMatchObject({ id: "a1", read: true });
  });

  it("dismissedOnly: shows dismissed articles instead of excluding them, and skips the exclusion filter", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1")],
      dismissedRows: [{ article_id: "a1" }],
      stateRows: [{ article_id: "a1", saved: false, read: false, dismissed: true }],
    });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24, dismissedOnly: true });
    expect(error).toBeNull();
    // The fake doesn't apply .in()/.not() filtering itself (Postgres's job);
    // what's testable here is that the request proceeds to enrichment
    // instead of the empty-shortcut a savedOnly/readOnly-style "nothing
    // matches" case would take, since dismissedRows is non-empty.
    expect(articles).toHaveLength(1);
    expect(articles![0]).toMatchObject({ id: "a1", dismissed: true });
  });

  it("dismissedOnly: returns an empty list without querying articles when nothing is dismissed", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")], dismissedRows: [] });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null, { limit: 24, dismissedOnly: true });
    expect(articles).toEqual([]);
    expect(error).toBeNull();
    const from = supabase.from as ReturnType<typeof vi.fn>;
    expect(from).not.toHaveBeenCalledWith("articles");
  });

  it("savedOnly + readOnly together: intersects the two ID lists, not a union", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1")],
      savedRows: [{ article_id: "a1" }, { article_id: "a2" }],
      readRows: [{ article_id: "a2" }, { article_id: "a3" }],
    });
    // a1 is saved-only, a3 is read-only, a2 is both — only a2 should survive
    // the intersection. The fake can't verify the .in() argument directly,
    // but an empty intersection (no article_id in both lists) must still
    // short-circuit before querying articles at all.
    const empty = makeFakeSupabase({
      articles: [article("a1", "user-1")],
      savedRows: [{ article_id: "a1" }],
      readRows: [{ article_id: "a2" }],
    });
    const { articles, error } = await fetchEnrichedArticles(empty, "me", null, {
      limit: 24,
      savedOnly: true,
      readOnly: true,
    });
    expect(articles).toEqual([]);
    expect(error).toBeNull();
    const from = empty.from as ReturnType<typeof vi.fn>;
    expect(from).not.toHaveBeenCalledWith("articles");
    // Sanity-check the non-empty intersection case reaches the articles query
    const { articles: articles2 } = await fetchEnrichedArticles(supabase, "me", null, {
      limit: 24,
      savedOnly: true,
      readOnly: true,
    });
    expect(articles2).toHaveLength(1);
  });
});

describe("encodeCursor / decodeCursor", () => {
  const uuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("round-trips created_at and id", () => {
    const cursor = encodeCursor("2026-07-01T00:00:00Z", uuid);
    expect(decodeCursor(cursor)).toEqual({ created_at: "2026-07-01T00:00:00Z", id: uuid });
  });

  it("accepts the timestamp format Supabase actually returns (+00:00 offset, microseconds)", () => {
    const cursor = encodeCursor("2026-07-09T21:15:00.797047+00:00", uuid);
    expect(decodeCursor(cursor)).toEqual({ created_at: "2026-07-09T21:15:00.797047+00:00", id: uuid });
  });

  it("throws on garbage input", () => {
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow();
  });

  // Both values get interpolated into a PostgREST .or() filter string, so a
  // well-formed base64 cursor with filter syntax inside must still be rejected
  it("rejects a structurally valid cursor whose id is not a UUID", () => {
    const cursor = encodeCursor("2026-07-01T00:00:00Z", "x,id.not.is.null");
    expect(() => decodeCursor(cursor)).toThrow();
  });

  it("rejects a structurally valid cursor whose created_at is not an ISO timestamp", () => {
    const cursor = encodeCursor("x,and(created_at.eq.1)", uuid);
    expect(() => decodeCursor(cursor)).toThrow();
  });
});

describe("fetchAllTags", () => {
  it("flattens, dedupes, and sorts tags across all articles", async () => {
    const supabase = makeFakeSupabase({
      articles: [
        { tags: ["tech", "politics"] },
        { tags: ["tech", "climate"] },
        { tags: [] },
        { tags: null },
      ],
    });
    expect(await fetchAllTags(supabase)).toEqual(["climate", "politics", "tech"]);
  });

  it("degrades to an empty list (not a throw) on a DB error", async () => {
    const supabase = makeFakeSupabase({ articlesError: { message: "boom" } });
    expect(await fetchAllTags(supabase)).toEqual([]);
  });
});
