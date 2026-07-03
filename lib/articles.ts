import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by GET /api/articles and the server-rendered feed page.
// Fetches articles (optionally filtered by tag) and enriches each with
// nod counts and the submitter's display name, one batched query each.
export async function fetchEnrichedArticles(
  supabase: SupabaseClient,
  userId: string,
  tag: string | null
) {
  let query = supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  if (tag) query = query.contains("tags", [tag]);

  const { data: articles, error } = await query;
  if (error) return { articles: null, error: error.message };

  const articleIds = (articles ?? []).map((a) => a.id);
  const submitterIds = [...new Set((articles ?? []).map((a) => a.submitted_by))];
  const [{ data: nods }, { data: profiles }] = await Promise.all([
    articleIds.length
      ? supabase.from("nods").select("article_id, user_id").in("article_id", articleIds)
      : Promise.resolve({ data: [] }),
    submitterIds.length
      ? supabase.from("profiles").select("id, display_name").in("id", submitterIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nodsData = nods ?? [];
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const enriched = (articles ?? []).map((article) => ({
    ...article,
    nod_count: nodsData.filter((n) => n.article_id === article.id).length,
    user_has_nodded: nodsData.some((n) => n.article_id === article.id && n.user_id === userId),
    submitter_name: nameById.get(article.submitted_by) ?? null,
  }));

  return { articles: enriched, error: null };
}
