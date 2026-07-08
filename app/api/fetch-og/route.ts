import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchOgCache } from "@/lib/server-cache";

// 10 previews/minute per user: generous for a human clicking Preview,
// tight enough that a runaway script can't burn the Microlink free-tier
// quota in one sitting. Cache hits don't count against the limit.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { url } = await request.json();
  if (!url) return NextResponse.json({ error: "URL required" }, { status: 400 });

  // Cache first: serving a cached result costs nothing, so it neither hits
  // Microlink nor counts against the user's rate limit
  const cached = fetchOgCache.get(url);
  if (cached) return NextResponse.json(cached.body, { status: cached.status });

  const rate = checkRateLimit(`fetch-og:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many preview requests — wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=false`
    );

    const json = await res.json();

    if (json.status !== "success") {
      console.error(`[fetch-og] Microlink failed for ${url}: ${json.code ?? ""} ${json.message ?? json.status}`);
      const needsManual = json.code === "EPROXYNEEDED";
      const body = { error: "Could not fetch metadata", manual: needsManual };
      // EPROXYNEEDED is a stable antibot classification (NYT/WSJ always hit
      // it) — cache it so repeat shares of blocked sites skip Microlink.
      // Other failures may be transient, so they always retry.
      if (needsManual) fetchOgCache.set(url, { status: 422, body });
      return NextResponse.json(body, { status: 422 });
    }

    const { data } = json;
    const body = {
      title: data.title ?? null,
      description: data.description ?? null,
      // logo no longer doubles as the hero-image fallback — it has its own
      // field now and renders as the publication badge on the card
      image_url: data.image?.url ?? null,
      site_name: data.publisher ?? null,
      site_icon_url: data.logo?.url ?? null,
    };
    fetchOgCache.set(url, { status: 200, body });
    return NextResponse.json(body);
  } catch (e) {
    console.error("[fetch-og] Error:", e);
    return NextResponse.json({ error: "Could not fetch metadata" }, { status: 422 });
  }
}
