import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { archiveCheckCache } from "@/lib/server-cache";
import { logInfo, logWarn } from "@/lib/logger";

// archive.today has no official API. `archive.ph/newest/{url}` 302-redirects
// to the most recent snapshot when one exists, so we read the Location header
// without following it. Their anti-bot protection may block datacenter IPs;
// any failure degrades to { found: false } and the form falls back to links.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// archive.ph already 429s aggressively — don't let one user's spam get the
// deployment's IP range blocked for everyone. Cache hits don't count.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  // Found snapshots are permanent, so positive results are cached; a
  // found=false may flip the moment someone archives the page, so negative
  // results always re-check
  const cached = archiveCheckCache.get(url);
  if (cached) return NextResponse.json({ found: true, archive_url: cached.archive_url });

  const rate = checkRateLimit(`archive-check:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    // The lookup is best-effort everywhere it's consumed — a rate-limited
    // client just behaves as if no snapshot was found
    return NextResponse.json(
      { found: false },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const res = await fetch(`https://archive.ph/newest/${url}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": BROWSER_UA },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const archiveUrl = location.startsWith("/") ? `https://archive.ph${location}` : location;
      archiveCheckCache.set(url, { archive_url: archiveUrl });
      return NextResponse.json({ found: true, archive_url: archiveUrl });
    }

    // 404 = no snapshot; 403/429/200-challenge = likely bot-blocked.
    // Log the status so production behavior is visible in Vercel logs.
    logInfo("archive-check", `no snapshot for ${url} (status ${res.status})`);
    return NextResponse.json({ found: false });
  } catch (e) {
    logWarn("archive-check", `lookup failed for ${url}`, e);
    return NextResponse.json({ found: false });
  }
}
