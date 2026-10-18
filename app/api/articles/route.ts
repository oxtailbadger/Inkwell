import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchEnrichedArticles } from "@/lib/articles";
import { dbErrorResponse } from "@/lib/api-errors";
import { readJsonObject, validationErrorResponse } from "@/lib/http";
import {
  duplicateLinkMessage,
  isDuplicateLinkError,
  type ExistingShare,
} from "@/lib/duplicate-link";
import {
  LIMITS,
  ValidationError,
  validateHttpUrl,
  validateTags,
  validateText,
  validateUuid,
} from "@/lib/validate";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tag = request.nextUrl.searchParams.get("tag");
  const cursor = request.nextUrl.searchParams.get("cursor");
  const savedOnly = request.nextUrl.searchParams.get("saved") === "1";
  const readOnly = request.nextUrl.searchParams.get("read") === "1";
  const dismissedOnly = request.nextUrl.searchParams.get("dismissed") === "1";
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const { articles, nextCursor, error } = await fetchEnrichedArticles(supabase, user.id, tag, {
    limit,
    cursor,
    savedOnly,
    readOnly,
    dismissedOnly,
  });
  if (error) {
    // Bad cursor input is a client mistake (400), anything else is a
    // genuine server-side failure (500) — fetchEnrichedArticles doesn't
    // distinguish the two in its return shape, so do it here by message.
    const status = error === "Invalid pagination cursor" ? 400 : 500;
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ articles, nextCursor });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

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

  if (error) {
    // The same link was already shared (the unique index from
    // supabase/duplicate-links.sql). A 409 with a human message, not a generic
    // 500 — the person should be told who has it and pointed at a Nod instead.
    if (isDuplicateLinkError(error)) return duplicateLinkResponse(supabase, url, user.id);
    return dbErrorResponse("articles:POST", error, "Could not save the article. Please try again.");
  }
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let id: string;
  try {
    id = validateUuid(request.nextUrl.searchParams.get("id"), "id");
  } catch (e) {
    return validationErrorResponse(e);
  }

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

// Looks up who already shared this link, to say so. Best effort: if the lookup
// fails the person still gets a correct 409, just without the name.
async function duplicateLinkResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: string,
  userId: string
) {
  const { data } = await supabase.rpc("find_shared_article", { p_url: url });
  const existing = (Array.isArray(data) ? data[0] : null) as ExistingShare | null;
  return NextResponse.json(
    {
      error: duplicateLinkMessage(existing, userId),
      existing: existing
        ? {
            id: existing.id,
            title: existing.title,
            shared_by: existing.shared_by,
            is_you: existing.submitted_by === userId,
          }
        : null,
    },
    { status: 409 }
  );
}
