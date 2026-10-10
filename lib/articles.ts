import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/logger";

// Single source of truth for the article shape the feed consumes:
// the articles row plus the enrichment added by fetchEnrichedArticles.
export type Article = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  site_icon_url: string | null;
  tags: string[];
  archive_url: string | null;
  submitted_by: string;
  created_at: string;
  nod_count: number;
  user_has_nodded: boolean;
  submitter_name: string | null;
  saved: boolean;
  read: boolean;
  dismissed: boolean;
};

// Opaque pagination cursor: base64 of {created_at, id}. `id` is a random
// UUID (not sortable alone), so it's only usable as a tie-breaker alongside
// created_at for rows sharing the same timestamp — hence encoding both.
export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ created_at: createdAt, id })).toString("base64");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export function decodeCursor(cursor: string): { created_at: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    // Both values are passed to feed_articles() as typed parameters (uuid /
    // timestamptz), so a malformed one can't inject filter syntax — but it
    // would make Postgres throw, surfacing as a 500 for what is really a bad
    // request. The API is the trust boundary for cursors (see lib/validate.ts
    // for the broader picture): require a real UUID and a real ISO timestamp
    // so the caller gets a clean 400 instead.
    if (typeof parsed.created_at !== "string" || typeof parsed.id !== "string") throw new Error();
    if (!UUID_RE.test(parsed.id) || !ISO_TIMESTAMP_RE.test(parsed.created_at)) throw new Error();
    return parsed;
  } catch {
    throw new Error("Invalid pagination cursor");
  }
}

// All distinct tags across every article, for the feed's tag-filter bar.
// Pagination made deriving this from the loaded page wrong (tags on older
// articles silently vanished from the bar), so it's one dedicated query —
// tags column only, cheap even against the whole table. Failure degrades
// to an empty bar rather than breaking the feed.
export async function fetchAllTags(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("articles").select("tags");
  if (error) {
    logError("fetchAllTags", error.message);
    return [];
  }
  return [...new Set((data ?? []).flatMap((row) => (row.tags as string[]) ?? []))].sort();
}

// Shared by GET /api/articles and the server-rendered feed page.
// Fetches one page of articles and enriches each with nod counts, the current
// user's nod state, the submitter's display name, and the user's own
// saved/read/dismissed flags.
//
// All filtering (tag, saved/read/dismissed, cursor) happens inside Postgres in
// the feed_articles() function — see supabase/launch-hardening.sql for the
// exact semantics. This used to pre-fetch the caller's dismissed/saved/read
// article IDs and send them back through the request URL, which has a hard
// length limit and so failed outright for users with a few hundred dismissed
// articles. Nothing here grows with a user's history any more: every query
// below is bounded by the page size.
export async function fetchEnrichedArticles(
  supabase: SupabaseClient,
  userId: string,
  tag: string | null,
  opts: { limit: number; cursor?: string | null; savedOnly?: boolean; readOnly?: boolean; dismissedOnly?: boolean } = {
    limit: 24,
  }
) {
  const { limit, cursor, savedOnly, readOnly, dismissedOnly } = opts;

  let decoded: { created_at: string; id: string } | null = null;
  if (cursor) {
    try {
      decoded = decodeCursor(cursor);
    } catch {
      return { articles: null, nextCursor: null, error: "Invalid pagination cursor" };
    }
  }

  // Fetch one extra row past `limit` purely to know whether a next page
  // exists. Ordering is (created_at desc, id desc) so id breaks ties between
  // same-timestamp rows, which a stable cursor needs. The caller's identity
  // comes from their session inside the function (auth.uid()), not from a
  // parameter, so a request can't ask for another user's state.
  const { data: page, error } = await supabase.rpc("feed_articles", {
    p_tag: tag,
    p_saved: Boolean(savedOnly),
    p_read: Boolean(readOnly),
    p_dismissed: Boolean(dismissedOnly),
    p_before_created_at: decoded?.created_at ?? null,
    p_before_id: decoded?.id ?? null,
    p_limit: limit + 1,
  });
  if (error) {
    logError("fetchEnrichedArticles", error.message);
    return { articles: null, nextCursor: null, error: "Could not load articles. Please try again." };
  }

  const rows = page ?? [];
  const hasMore = rows.length > limit;
  const articles = hasMore ? rows.slice(0, limit) : rows;
  const last = articles[articles.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

  const articleIds = articles.map((a: { id: string }) => a.id);
  const submitterIds = [...new Set(articles.map((a: { submitted_by: string }) => a.submitted_by))];

  // Nod counts come pre-aggregated from the article_nod_counts view
  // (Postgres does the count(*) group by, not a JS loop over every nod);
  // whether the current user has nodded is still inherently per-user, so
  // that stays a separate scoped query. The state query is bounded to this
  // page's ids, not the user's whole history.
  const [{ data: nodCounts }, { data: userNods }, { data: profiles }, { data: stateRows }] = await Promise.all([
    articleIds.length
      ? supabase.from("article_nod_counts").select("article_id, nod_count").in("article_id", articleIds)
      : Promise.resolve({ data: [] }),
    articleIds.length
      ? supabase.from("nods").select("article_id").eq("user_id", userId).in("article_id", articleIds)
      : Promise.resolve({ data: [] }),
    submitterIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", submitterIds)
      : Promise.resolve({ data: [] }),
    articleIds.length
      ? supabase.from("article_state").select("article_id, saved, read, dismissed").eq("user_id", userId).in("article_id", articleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nodCountById = new Map((nodCounts ?? []).map((n) => [n.article_id, n.nod_count as number]));
  const noddedSet = new Set((userNods ?? []).map((n) => n.article_id));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const stateById = new Map(
    (stateRows ?? []).map((s) => [s.article_id, { saved: s.saved as boolean, read: s.read as boolean, dismissed: s.dismissed as boolean }])
  );
  const defaultState = { saved: false, read: false, dismissed: false };

  const enriched: Article[] = articles.map((article: Article) => ({
    ...article,
    nod_count: nodCountById.get(article.id) ?? 0,
    user_has_nodded: noddedSet.has(article.id),
    submitter_name: nameById.get(article.submitted_by) ?? null,
    ...(stateById.get(article.id) ?? defaultState),
  }));

  return { articles: enriched, nextCursor, error: null };
}
