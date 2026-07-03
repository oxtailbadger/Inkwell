import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tag = request.nextUrl.searchParams.get("tag");

  let query = supabase
    .from("articles")
    .select("*")
    .order("created_at", { ascending: false });

  if (tag) query = query.contains("tags", [tag]);

  const { data: articles, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch nods and submitter profiles for these articles, one query each
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
    user_has_nodded: nodsData.some((n) => n.article_id === article.id && n.user_id === user.id),
    submitter_name: nameById.get(article.submitted_by) ?? null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { url, title, description, image_url, site_name, tags, archive_url } = body;

  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  const { data, error } = await supabase.from("articles").insert({
    url,
    title,
    description,
    image_url,
    site_name,
    tags: tags ?? [],
    archive_url: archive_url || null,
    submitted_by: user.id,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase.from("articles").delete().eq("id", id).eq("submitted_by", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
