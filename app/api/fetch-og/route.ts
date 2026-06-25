import { NextRequest, NextResponse } from "next/server";
import ogs from "open-graph-scraper";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await request.json();
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  try {
    const { result } = await ogs({ url, fetchOptions: { headers: { "user-agent": "Twitterbot/1.0" } } });
    return NextResponse.json({
      title: result.ogTitle ?? result.twitterTitle ?? null,
      description: result.ogDescription ?? result.twitterDescription ?? null,
      image_url: result.ogImage?.[0]?.url ?? result.twitterImage?.[0]?.url ?? null,
      site_name: result.ogSiteName ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch metadata" }, { status: 422 });
  }
}
