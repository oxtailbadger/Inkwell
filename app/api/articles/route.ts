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

  // Fetch all nods for these articles in one query
  const articleIds = (articles ?? []).map((a) => a.id);
  const { data: nods } = articleIds.length
    ? await supabase.from("nods").select("article_id, user_id").in("article_id", articleIds)
    : { data: [] };

  const nodsData = nods ?? [];
  const articlesWithNods = (articles ?? []).map((article) => ({
    ...article,
    nod_count: nodsData.filter((n) => n.article_id === article.id).length,
    user_has_nodded: nodsData.some((n) => n.article_id === article.id && n.user_id === user.id),
  }));

  return NextResponse.json(articlesWithNods);
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
