import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";
// Heuristics live in lib/paywall.ts so they're unit-testable (route files
// may only export route handlers)
import { isPaywalled, type RSSItem } from "@/lib/paywall";

const parser = new Parser();

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
        console.log(
          `[author-articles] ${author.name}: ${feed.items.length} items, ` +
            `${paywalled.length} filtered as paywalled` +
            (paywalled.length ? ` (${paywalled.map((i) => i.title).join(" | ")})` : "")
        );
        if (free.length === 0 && feed.items.length > 0) {
          console.warn(
            `[author-articles] ${author.name}: every item filtered as paywalled — heuristics likely misfiring`
          );
        }

        const articles = free.slice(0, 3).map((item) => ({
          url: item.link ?? "",
          title: item.title ?? null,
          description: item.contentSnippet?.slice(0, 200) ?? null,
          published_at: item.pubDate ?? null,
        }));

        return {
          id: author.id,
          name: author.name,
          website_url: author.website_url,
          site_icon_url: author.site_icon_url ?? null,
          articles,
        };
      } catch (err) {
        console.error(`[author-articles] failed to fetch feed for ${author.name} (${author.rss_url}):`, err);
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
