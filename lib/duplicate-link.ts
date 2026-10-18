// Duplicate-link protection, application side.
//
// The database owns the rule (supabase/duplicate-links.sql): a trigger fills
// articles.url_canonical from the URL — lowercased host, no tracking params, no
// fragment, no trailing slash, http == https, ?a=1&b=2 == ?b=2&a=1 — and a unique
// index on it rejects a second share of the same link. The canonicalizing lives
// in ONE place, in SQL, on purpose: a TypeScript copy would have to agree with it
// character for character or the two would disagree about what counts as a
// duplicate.
//
// So the app never computes or sends the canonical form. It just recognizes the
// resulting unique-violation and turns it into a helpful message. That also makes
// this safe to deploy before the SQL is run: until then there is no unique index,
// so this code path can't be reached and sharing behaves exactly as it did.

export const DUPLICATE_LINK_CONSTRAINT = "articles_url_canonical_key";

type PostgresLikeError = { code?: string | null; message?: string | null; details?: string | null };

// A unique violation (SQLSTATE 23505) on THIS index. Other unique violations
// (there shouldn't be any on articles) fall through to the generic error.
export function isDuplicateLinkError(error: PostgresLikeError | null | undefined): boolean {
  if (!error || error.code !== "23505") return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return text.includes(DUPLICATE_LINK_CONSTRAINT);
}

// Row shape returned by the find_shared_article() SQL function
export type ExistingShare = {
  id: string;
  title: string | null;
  submitted_by: string;
  shared_by: string | null;
  created_at: string;
};

export function duplicateLinkMessage(existing: ExistingShare | null, currentUserId: string): string {
  if (!existing) {
    return "That link has already been shared — find it in the feed and give it a Nod instead.";
  }
  if (existing.submitted_by === currentUserId) {
    return "You already shared this link.";
  }
  const who = existing.shared_by?.trim() || "A friend";
  return `${who} already shared this link — find it in the feed and give it a Nod instead.`;
}
