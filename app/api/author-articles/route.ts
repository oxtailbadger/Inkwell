import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "@/lib/api-errors";

type RSSItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  pubDate?: string;
  categories?: string[];
};

const parser = new Parser();

const PAID_CATEGORIES = ["daily update", "this week in stratechery"];
const PAID_DESCRIPTION_MARKERS = [
  "thank you for being a paid subscriber",
  "this post is for paid subscribers",
  "subscribe to read",
  "for paying subscribers",
];

function isPaywalled(item: RSSItem): boolean {
  const desc = (item.contentSnippet ?? "").toLowerCase();
  const cats = (item.categories ?? []).map((c) => c.toLowerCase());

  if (PAID_CATEGORIES.some((p) => cats.includes(p))) return true;
  if (PAID_DESCRIPTION_MARKERS.some((m) => desc.includes(m))) return true;
  if (desc.length > 0 && desc.length < 80) return true;

  return false;
}

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
