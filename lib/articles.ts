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
    // Shape validation isn't enough: both values get interpolated into a
    // PostgREST .or() filter string below, so a hand-crafted cursor could
    // otherwise inject filter syntax. The API is the trust boundary (see
    // lib/validate.ts) — require a real UUID and a real ISO timestamp.
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
// Fetches one page of articles (optionally filtered by tag) and enriches
// each with nod counts, the current user's nod state, and the submitter's
// display name.
export async function fetchEnrichedArticles(
  supabase: SupabaseClient,
  userId: string,
  tag: string | null,
  opts: { limit: number; cursor?: string | null; savedOnly?: boolean } = { limit: 24 }
) {
  const { limit, cursor, savedOnly } = opts;

  let decoded: { created_at: string; id: string } | null = null;
  if (cursor) {
    try {
      decoded = decodeCursor(cursor);
    } catch {
      return { articles: null, nextCursor: null, error: "Invalid pagination cursor" };
    }
  }

  // Articles this user has dismissed are excluded from the feed at the
  // query level (not filtered client-side) so page-size math stays correct
  // as pages fill in — a small, bounded lookup, same batching idiom as the
  // articleIds/submitterIds queries below.
  const { data: dismissedRows } = await supabase
    .from("article_state")
    .select("article_id")
    .eq("user_id", userId)
    .eq("dismissed", true);
  const dismissedIds = (dismissedRows ?? []).map((r) => r.article_id as string);

  // "Saved" view: a second bounded lookup, only when requested. Dismissed
  // still wins over saved (see DECISIONS.md) — a dismissed article
  // disappears everywhere, including from the Saved view, rather than
  // needing a second "un-hide" action to find it again.
  let savedIds: string[] | null = null;
  if (savedOnly) {
    const { data: savedRows } = await supabase
      .from("article_state")
      .select("article_id")
      .eq("user_id", userId)
      .eq("saved", true);
    savedIds = (savedRows ?? []).map((r) => r.article_id as string);
    if (savedIds.length === 0) return { articles: [], nextCursor: null, error: null };
  }

  // Order by created_at then id (both descending) so id can break ties
  // between same-timestamp rows — needed for a stable cursor. Fetch one
  // extra row past `limit` purely to know whether a next page exists.
  let query = supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (tag) query = query.contains("tags", [tag]);
  if (savedIds) query = query.in("id", savedIds);
  if (decoded) {
    query = query.or(
      `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
    );
  }
  if (dismissedIds.length > 0) {
    query = query.not("id", "in", `(${dismissedIds.join(",")})`);
  }

  const { data: page, error } = await query;
  if (error) {
    logError("fetchEnrichedArticles", error.message);
    return { articles: null, nextCursor: null, error: "Could not load articles. Please try again." };
  }

  const rows = page ?? [];
  const hasMore = rows.length > limit;
  const articles = hasMore ? rows.slice(0, limit) : rows;
  const last = articles[articles.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

  const articleIds = articles.map((a) => a.id);
  const submitterIds = [...new Set(articles.map((a) => a.submitted_by))];

  // Nod counts come pre-aggregated from the article_nod_counts view
  // (Postgres does the count(*) group by, not a JS loop over every nod);
  // whether the current user has nodded is still inherently per-user, so
  // that stays a separate scoped query.
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

  const enriched: Article[] = articles.map((article) => ({
    ...article,
    nod_count: nodCountById.get(article.id) ?? 0,
    user_has_nodded: noddedSet.has(article.id),
    submitter_name: nameById.get(article.submitted_by) ?? null,
    ...(stateById.get(article.id) ?? defaultState),
  }));

  return { articles: enriched, nextCursor, error: null };
}
