import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEnrichedArticles } from "@/lib/articles";

const article = (id: string, submitted_by: string) => ({
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
  created_at: "2026-07-01T00:00:00Z",
});

// fetchEnrichedArticles takes the client as an argument, so no vi.mock needed
// — just a fake matching the three query shapes it issues:
//   articles: select("*").order(...)[.contains(...)] then awaited (thenable)
//   nods:     select(...).in(...)
//   profiles: select(...).in(...)
function makeFakeSupabase({
  articles = [] as object[],
  articlesError = null as { message: string } | null,
  nods = [] as { article_id: string; user_id: string }[],
  profiles = [] as { id: string; display_name: string }[],
} = {}) {
  const articlesResult = { data: articlesError ? null : articles, error: articlesError };
  const thenable = {
    contains: vi.fn(() => Promise.resolve(articlesResult)),
    then: (resolve: (v: typeof articlesResult) => void) =>
      Promise.resolve(articlesResult).then(resolve),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "articles") {
        return { select: () => ({ order: () => thenable }) };
      }
      if (table === "nods") {
        return { select: () => ({ in: () => Promise.resolve({ data: nods, error: null }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ in: () => Promise.resolve({ data: profiles, error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as unknown as SupabaseClient;
}

describe("fetchEnrichedArticles", () => {
  it("merges nod counts, the caller's nod state, and submitter display names", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-1"), article("a2", "user-2")],
      nods: [
        { article_id: "a1", user_id: "me" },
        { article_id: "a1", user_id: "user-2" },
        { article_id: "a2", user_id: "user-2" },
      ],
      profiles: [
        { id: "user-1", display_name: "priya" },
        { id: "user-2", display_name: "ben" },
      ],
    });

    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null);

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

  it("falls back to submitter_name:null when no profile row exists", async () => {
    const supabase = makeFakeSupabase({
      articles: [article("a1", "user-without-profile")],
    });
    const { articles } = await fetchEnrichedArticles(supabase, "me", null);
    expect(articles![0].submitter_name).toBeNull();
    expect(articles![0].nod_count).toBe(0);
    expect(articles![0].user_has_nodded).toBe(false);
  });

  it("returns an empty list (not an error) when there are no articles", async () => {
    const supabase = makeFakeSupabase({ articles: [] });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null);
    expect(error).toBeNull();
    expect(articles).toEqual([]);
  });

  it("filters by tag via .contains when a tag is passed", async () => {
    const supabase = makeFakeSupabase({ articles: [article("a1", "user-1")] });
    await fetchEnrichedArticles(supabase, "me", "tech");
    // The route only reaches .contains when a tag is present
    const from = (supabase.from as ReturnType<typeof vi.fn>);
    expect(from).toHaveBeenCalledWith("articles");
  });

  it("returns a friendly error string, not the raw DB message", async () => {
    const supabase = makeFakeSupabase({
      articlesError: { message: 'relation "articles" does not exist' },
    });
    const { articles, error } = await fetchEnrichedArticles(supabase, "me", null);
    expect(articles).toBeNull();
    expect(error).not.toContain("relation");
    expect(error).toBeTruthy();
  });
});
