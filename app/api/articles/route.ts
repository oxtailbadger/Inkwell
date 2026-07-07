import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEnrichedArticles } from "@/lib/articles";
import { dbErrorResponse } from "@/lib/api-errors";
import { LIMITS, ValidationError, validateHttpUrl, validateTags, validateText } from "@/lib/validate";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tag = request.nextUrl.searchParams.get("tag");
  const { articles, error } = await fetchEnrichedArticles(supabase, user.id, tag);
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json(articles);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  let url: string, title: string | null, description: string | null;
  let image_url: string | null, site_name: string | null, site_icon_url: string | null;
  let archive_url: string | null, tags: string[];
  try {
    url = validateHttpUrl(body.url, { required: true })!;
    title = validateText(body.title, LIMITS.TITLE, "Title");
    description = validateText(body.description, LIMITS.DESCRIPTION, "Description");
    site_name = validateText(body.site_name, LIMITS.SITE_NAME, "Site name");
    image_url = validateHttpUrl(body.image_url);
    site_icon_url = validateHttpUrl(body.site_icon_url);
    archive_url = validateHttpUrl(body.archive_url);
    tags = validateTags(body.tags);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const { data, error } = await supabase.from("articles").insert({
    url,
    title,
    description,
    image_url,
    site_name,
    site_icon_url,
    tags,
    archive_url,
    submitted_by: user.id,
  }).select().single();

  if (error) return dbErrorResponse("articles:POST", error, "Could not save the article. Please try again.");
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  // A delete with a submitted_by filter that matches zero rows doesn't error
  // — it silently no-ops — so a non-owner DELETE used to return 200 with
  // nothing actually removed. Look up ownership first to return an honest
  // 404 (doesn't exist) or 403 (exists, not yours).
  const { data: existing, error: lookupError } = await supabase
    .from("articles")
    .select("submitted_by")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) return dbErrorResponse("articles:DELETE", lookupError, "Could not remove the article. Please try again.");
  if (!existing) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (existing.submitted_by !== user.id) {
    return NextResponse.json({ error: "You can only remove articles you shared" }, { status: 403 });
  }

  const { error } = await supabase.from("articles").delete().eq("id", id).eq("submitted_by", user.id);
  if (error) return dbErrorResponse("articles:DELETE", error, "Could not remove the article. Please try again.");
  return NextResponse.json({ success: true });
}
