// How an article's "shared on" date is displayed.
//
// The first page of articles is rendered on the server and then hydrated in the
// browser. `toLocaleDateString()` with no arguments formats in the *runtime's*
// timezone and locale — UTC on Vercel, the viewer's own in the browser — so the
// same timestamp rendered two different strings and React flagged a hydration
// mismatch (and the date could visibly change after load). Pinning the locale
// removes the locale half; the timezone is passed in so the server render can
// be deterministic ("UTC") and the client can then show the viewer's local day.
export function formatShareDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  // An unparseable value used to render as the literal text "Invalid Date"
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(date);
}
