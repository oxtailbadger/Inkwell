import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";
// Heuristics live in lib/paywall.ts so they're unit-testable (route files
// may only export route handlers)
import { isPaywalled, type RSSItem } from "@/lib/paywall";
import { logInfo, logWarn, logError } from "@/lib/logger";
import { safeHttpUrl } from "@/lib/validate";

// rss-parser's default is 60 s, and the authors are fetched in parallel with
// Promise.all — so one hung publisher used to hold the whole Authors card (and
// the function invocation) hostage for a minute. A healthy feed answers in well
// under a second; 5 s is generous, and a timeout lands in the per-author catch
// below, which degrades just that author to "no articles".
const FEED_TIMEOUT_MS = 5000;

const parser = new Parser({ timeout: FEED_TIMEOUT_MS });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: authors, error } = await supabase
    .from("authors")
    .select("*")
    .order("name");

  if (error) return dbErrorResponse("author-articles:GET", error, "Could not load authors. Please try again.");

  const results = await Promise.all(
    (authors ?? []).map(async (author) => {
      try {
        const feed = await parser.parseURL(author.rss_url);
        const [free, paywalled] = feed.items.reduce<[RSSItem[], RSSItem[]]>(
          (acc, item) => (acc[isPaywalled(item) ? 1 : 0].push(item), acc),
          [[], []]
        );

        // Log what the heuristics filtered so we notice when they misfire
        // (e.g. Substack rewords its paid-teaser text) — check Vercel logs
        logInfo(
          "author-articles",
          `${author.name}: ${feed.items.length} items, ` +
            `${paywalled.length} filtered as paywalled` +
            (paywalled.length ? ` (${paywalled.map((i) => i.title).join(" | ")})` : "")
        );
        if (free.length === 0 && feed.items.length > 0) {
          logWarn(
            "author-articles",
            `${author.name}: every item filtered as paywalled — heuristics likely misfiring`
          );
        }

        // item.link comes straight from a third-party feed and is rendered as
        // an <a href>. React 19 blocks javascript: URLs, but that's the
        // framework's last line of defence, not ours — keep only http(s)
        // links, and drop items with no usable link at all (they used to
        // render as href="" and collide on the list key).
        const articles = free
          .flatMap((item) => {
            const url = safeHttpUrl(item.link);
            if (!url) return [];
            return [
              {
                url,
                title: item.title ?? null,
                description: item.contentSnippet?.slice(0, 200) ?? null,
                published_at: item.pubDate ?? null,
              },
            ];
          })
          .slice(0, 3);

        return {
          id: author.id,
          name: author.name,
          website_url: author.website_url,
          site_icon_url: author.site_icon_url ?? null,
          articles,
        };
      } catch (err) {
        logError("author-articles", `failed to fetch feed for ${author.name} (${author.rss_url})`, err);
        return {
          id: author.id,
          name: author.name,
          website_url: author.website_url,
          site_icon_url: author.site_icon_url ?? null,
          articles: [],
        };
      }
    })
  );

  return NextResponse.json(results, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" },
  });
}
