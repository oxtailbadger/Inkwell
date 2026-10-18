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
// — just a fake matching the calls it issues:
//   rpc("feed_articles", {...}):  the page itself. All filtering (tag, saved /
//                                 read / dismissed, cursor) happens in Postgres;
//                                 whether those arguments select the right rows
//                                 is tested against real SQL in
//                                 db-feed-articles.test.ts, not here.
//   article_nod_counts:           select(...).in(...)  — pre-aggregated counts
//   nods:                         select(...).eq("user_id", ...).in(...)
//   profiles:                     select(...).in(...)
//   article_state:                select(...).eq("user_id",...).in(...) — flags for THIS page only
//   articles (fetchAllTags only): select("tags") then awaited
function makeFakeSupabase({
  articles = [] as object[],
  rpcError = null as { message: string } | null,
  tagRows = [] as object[],
  tagsError = null as { message: string } | null,
  nodCounts = [] as { article_id: string; nod_count: number }[],
  myNods = [] as { article_id: string }[],
  profiles = [] as { id: string; display_name: string }[],
  stateRows = [] as { article_id: string; saved: boolean; read: boolean; dismissed: boolean }[],
} = {}) {
  const rpc = vi.fn(() => Promise.resolve({ data: rpcError ? null : articles, error: rpcError }));
  const stateIn = vi.fn(() => Promise.resolve({ data: stateRows, error: null }));
  const nodCountsIn = vi.fn(() => Promise.resolve({ data: nodCounts, error: null }));
  const nodsIn = vi.fn(() => Promise.resolve({ data: myNods, error: null }));
  const profilesIn = vi.fn(() => Promise.resolve({ data: profiles, error: null }));

  const from = vi.fn((table: string) => {
    if (table === "articles") {
      // Only fetchAllTags reads this table directly now.
      return { select: () => Promise.resolve({ data: tagsError ? null : tagRows, error: tagsError }) };
    }
    if (table === "article_nod_counts") return { select: () => ({ in: nodCountsIn }) };
    if (table === "nods") return { select: () => ({ eq: () => ({ in: nodsIn }) }) };
    if (table === "profiles") return { select: () => ({ in: profilesIn }) };
    if (table === "article_state") return { select: () => ({ eq: () => ({ in: stateIn }) }) };
    throw new Error(`unexpected table ${table}`);
  });

  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, stateIn, nodCountsIn, nodsIn, profilesIn };
}

describe("fetchEnrichedArticles", () => {
  it("merges nod counts (from the view), the caller's nod state, and submitter display names", async () => {
    const { client } = makeFakeSupabase({
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

    const { articles, error } = await fetchEnrichedArticles(client, "me", null, { limit: 24 });

    expect(error).toBeNull();
    expect(articles).toHaveLength(2);
    expect(articles![0]).toMatchObject({ id: "a1", nod_count: 2, user_has_nodded: true, submitter_name: "priya" });
    expect(articles![1]).toMatchObject({ id: "a2", nod_count: 1, user_has_nodded: false, submitter_name: "ben" });
  });

  it("falls back to submitter_name:null and nod_count:0 when no view/profile row exists", async () => {
    const { client } = makeFakeSupabase({ articles: [article("a1", "user-without-profile")] });
    const { articles } = await fetchEnrichedArticles(client, "me", null, { limit: 24 });
    expect(articles![0].submitter_name).toBeNull();
    expect(articles![0].nod_count).toBe(0);
    expect(articles![0].user_has_nodded).toBe(false);
  });

  it("merges saved/read/dismissed per article, defaulting to false when no state row exists", async () => {
    const { client } = makeFakeSupabase({
      articles: [article("a1", "user-1"), article("a2", "user-1")],
      stateRows: [{ article_id: "a1", saved: true, read: true, dismissed: false }],
    });
    const { articles } = await fetchEnrichedArticles(client, "me", null, { limit: 24 });
    expect(articles![0]).toMatchObject({ id: "a1", saved: true, read: true, dismissed: false });
    expect(articles![1]).toMatchObject({ id: "a2", saved: false, read: false, dismissed: false });
  });

  it("returns an empty list (not an error) when there are no articles, and runs no enrichment queries", async () => {
    const { client, from } = makeFakeSupabase({ articles: [] });
    const { articles, nextCursor, error } = await fetchEnrichedArticles(client, "me", null, { limit: 24 });
    expect(error).toBeNull();
    expect(articles).toEqual([]);
    expect(nextCursor).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns a friendly error string, not the raw DB message", async () => {
    const { client } = makeFakeSupabase({
      rpcError: { message: 'Could not find the function public.feed_articles in the schema cache' },
    });
    const { articles, error } = await fetchEnrichedArticles(client, "me", null, { limit: 24 });
    expect(articles).toBeNull();
    expect(error).not.toContain("feed_articles");
    expect(error).not.toContain("schema cache");
    expect(error).toBeTruthy();
  });

  describe("what it asks the database for", () => {
    it("calls feed_articles with no filters by default, asking for limit+1 rows", async () => {
      const { client, rpc } = makeFakeSupabase();
      await fetchEnrichedArticles(client, "me", null, { limit: 24 });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith("feed_articles", {
        p_tag: null,
        p_saved: false,
        p_read: false,
        p_dismissed: false,
        p_before_created_at: null,
        p_before_id: null,
        p_limit: 25,
      });
    });

    it("sends p_section only for Podcasts (Articles must work before sections.sql is run)", async () => {
      const { client, rpc } = makeFakeSupabase();
      await fetchEnrichedArticles(client, "me", null, { limit: 24, section: "articles" });
      const calls = rpc.mock.calls as unknown as [string, Record<string, unknown>][];
      expect(calls[0][1]).not.toHaveProperty("p_section");
      await fetchEnrichedArticles(client, "me", null, { limit: 24, section: "podcasts" });
      expect(calls[1][1]).toEqual(expect.objectContaining({ p_section: "podcasts" }));
    });

    it("passes the tag through", async () => {
      const { client, rpc } = makeFakeSupabase();
      await fetchEnrichedArticles(client, "me", "tech", { limit: 24 });
      expect(rpc).toHaveBeenCalledWith("feed_articles", expect.objectContaining({ p_tag: "tech" }));
    });

    it.each([
      ["savedOnly", { savedOnly: true }, { p_saved: true, p_read: false, p_dismissed: false }],
      ["readOnly", { readOnly: true }, { p_saved: false, p_read: true, p_dismissed: false }],
      ["dismissedOnly", { dismissedOnly: true }, { p_saved: false, p_read: false, p_dismissed: true }],
      [
        "all three together (independent toggles)",
        { savedOnly: true, readOnly: true, dismissedOnly: true },
        { p_saved: true, p_read: true, p_dismissed: true },
      ],
    ])("maps %s to the matching flags", async (_label, opts, expected) => {
      const { client, rpc } = makeFakeSupabase();
      await fetchEnrichedArticles(client, "me", null, { limit: 24, ...opts });
      expect(rpc).toHaveBeenCalledWith("feed_articles", expect.objectContaining(expected));
    });

    it("decodes the cursor into the keyset parameters", async () => {
      const id = "11111111-1111-4111-8111-111111111111";
      const { client, rpc } = makeFakeSupabase();
      const cursor = encodeCursor("2026-07-02T00:00:00Z", id);
      await fetchEnrichedArticles(client, "me", null, { limit: 24, cursor });
      expect(rpc).toHaveBeenCalledWith(
        "feed_articles",
        expect.objectContaining({ p_before_created_at: "2026-07-02T00:00:00Z", p_before_id: id })
      );
    });

    it("never pre-fetches the user's state IDs, and bounds the state lookup to this page", async () => {
      // Regression for the URL-length cliff: the old implementation read the
      // caller's *entire* dismissed/saved/read ID lists and sent them back in
      // the query URL. The only article_state read left is the per-page merge,
      // and its IN list can't exceed the page size.
      const { client, from, stateIn } = makeFakeSupabase({
        articles: [article("a1", "u1"), article("a2", "u1"), article("a3", "u1")],
      });
      await fetchEnrichedArticles(client, "me", null, { limit: 24, dismissedOnly: true, savedOnly: true });

      const stateReads = from.mock.calls.filter(([t]) => t === "article_state");
      expect(stateReads).toHaveLength(1);
      expect(stateIn).toHaveBeenCalledTimes(1);
      const [column, idList] = stateIn.mock.calls[0] as unknown as [string, string[]];
      expect(column).toBe("article_id");
      expect(idList).toEqual(["a1", "a2", "a3"]);
    });
  });

  describe("pagination", () => {
    // limit 2 → the function requests limit+1 (3); the fake just hands back
    // whatever is seeded, which is how a real "3 rows came back for a
    // limit-of-2 page" response looks. Real UUIDs: decodeCursor validates shape.
    const u1 = "11111111-1111-4111-8111-111111111111";
    const u2 = "22222222-2222-4222-8222-222222222222";
    const u3 = "33333333-3333-4333-8333-333333333333";

    it("returns a nextCursor and trims the extra row when more pages exist", async () => {
      const { client } = makeFakeSupabase({
        articles: [
          article(u1, "user-1", "2026-07-03T00:00:00Z"),
          article(u2, "user-1", "2026-07-02T00:00:00Z"),
          article(u3, "user-1", "2026-07-01T00:00:00Z"),
        ],
      });
      const { articles, nextCursor, error } = await fetchEnrichedArticles(client, "me", null, { limit: 2 });
      expect(error).toBeNull();
      expect(articles).toHaveLength(2);
      expect(articles!.map((a) => a.id)).toEqual([u1, u2]);
      expect(nextCursor).not.toBeNull();
      expect(decodeCursor(nextCursor!)).toEqual({ created_at: "2026-07-02T00:00:00Z", id: u2 });
    });

    it("returns nextCursor:null when the page isn't full (no more pages)", async () => {
      const { client } = makeFakeSupabase({
        articles: [article("a1", "user-1"), article("a2", "user-1")],
      });
      const { articles, nextCursor } = await fetchEnrichedArticles(client, "me", null, { limit: 5 });
      expect(articles).toHaveLength(2);
      expect(nextCursor).toBeNull();
    });

    it("returns a 'bad cursor' error without touching the database when it can't be decoded", async () => {
      const { client, rpc, from } = makeFakeSupabase({ articles: [article("a1", "user-1")] });
      const { articles, nextCursor, error } = await fetchEnrichedArticles(client, "me", null, {
        limit: 24,
        cursor: "not-valid-base64-json",
      });
      expect(articles).toBeNull();
      expect(nextCursor).toBeNull();
      expect(error).toBe("Invalid pagination cursor");
      expect(rpc).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    });
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

  // Both values reach Postgres as typed parameters, so this isn't about filter
  // injection any more — it's that a malformed one would make the database
  // throw (a 500) for what is really a bad request (a 400).
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
    const { client } = makeFakeSupabase({
      tagRows: [{ tags: ["tech", "politics"] }, { tags: ["tech", "climate"] }, { tags: [] }, { tags: null }],
    });
    expect(await fetchAllTags(client)).toEqual(["climate", "politics", "tech"]);
  });

  it("degrades to an empty list (not a throw) on a DB error", async () => {
    const { client } = makeFakeSupabase({ tagsError: { message: "boom" } });
    expect(await fetchAllTags(client)).toEqual([]);
  });
});
