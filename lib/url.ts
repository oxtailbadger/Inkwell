// Shared by ArticleCard (source badge/label) and AuthorFeed (site label,
// favicon lookup) — all three need the bare hostname of a stored/config URL
// for display purposes. Previously each component parsed this separately.
export function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
