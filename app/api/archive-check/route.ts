import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// archive.today has no official API. `archive.ph/newest/{url}` 302-redirects
// to the most recent snapshot when one exists, so we read the Location header
// without following it. Their anti-bot protection may block datacenter IPs;
// any failure degrades to { found: false } and the form falls back to links.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const res = await fetch(`https://archive.ph/newest/${url}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": BROWSER_UA },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const archiveUrl = location.startsWith("/") ? `https://archive.ph${location}` : location;
      return NextResponse.json({ found: true, archive_url: archiveUrl });
    }

    // 404 = no snapshot; 403/429/200-challenge = likely bot-blocked.
    // Log the status so production behavior is visible in Vercel logs.
    console.log(`[archive-check] no snapshot for ${url} (status ${res.status})`);
    return NextResponse.json({ found: false });
  } catch (e) {
    console.warn(`[archive-check] lookup failed for ${url}:`, e);
    return NextResponse.json({ found: false });
  }
}
