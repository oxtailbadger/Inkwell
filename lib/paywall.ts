// Paywall heuristics for the curated-author RSS feeds. Extracted from
// app/api/author-articles/route.ts so they can be unit-tested (Next route
// files may only export route handlers). These are the most fragile logic in
// the app — they depend on how each publisher formats paid-post teasers:
// - Stratechery marks paid posts with RSS <category> values ("Daily Update",
//   "This Week in Stratechery") and its free weekly essays with "Articles"
// - Substack puts a paid-subscriber notice in the description text
// - The <80-char fallback catches truncated teaser descriptions, but is a
//   *weak* signal, so an explicit free category (FREE_CATEGORIES) overrides it
// If an author's card starts showing zero items, check the
// `[author-articles]` warnings in Vercel logs — a publisher likely reworded.

export type RSSItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  pubDate?: string;
  categories?: string[];
};

export const PAID_CATEGORIES = ["daily update", "this week in stratechery"];

// Categories that positively mark an item as a free standalone article.
// Stratechery's free weekly essays carry <category>Articles</category>; their
// RSS teaser snippet is sometimes under 80 chars, which would otherwise trip
// the length fallback below and hide genuinely free posts (the reported bug).
export const FREE_CATEGORIES = ["articles"];

export const PAID_DESCRIPTION_MARKERS = [
  "thank you for being a paid subscriber",
  "this post is for paid subscribers",
  "subscribe to read",
  "for paying subscribers",
];

export function isPaywalled(item: RSSItem): boolean {
  const desc = (item.contentSnippet ?? "").toLowerCase();
  const cats = (item.categories ?? []).map((c) => c.toLowerCase());

  // Explicit paid signals are authoritative and checked first.
  if (PAID_CATEGORIES.some((p) => cats.includes(p))) return true;
  if (PAID_DESCRIPTION_MARKERS.some((m) => desc.includes(m))) return true;

  // The short-description fallback is a weak heuristic: skip it when the item
  // is explicitly categorized as a free article, so a free essay with a terse
  // teaser isn't filtered out.
  const isKnownFree = FREE_CATEGORIES.some((f) => cats.includes(f));
  if (!isKnownFree && desc.length > 0 && desc.length < 80) return true;

  return false;
}
