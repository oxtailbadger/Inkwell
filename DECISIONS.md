# Inkwell — Architecture Decisions

Non-obvious choices and the reasons behind them. Read this before refactoring anything that "looks wrong."

---

## Metadata fetching: Microlink over open-graph-scraper

We use the Microlink API (`app/api/fetch-og/route.ts`) instead of the `open-graph-scraper` npm package. OGS fails silently on major publishers (NYT, CNN) — it returns no error but also no data. Microlink returns structured errors we can act on.

**Gotcha:** Microlink returns HTTP 200 even on failure. Check `json.status !== "success"`, not `!res.ok`.

**Gotcha:** Major publishers (NYT, WSJ) trigger `EPROXYNEEDED` from Microlink — their antibot protection blocks the proxy. When this happens we return `{ manual: true }` and the UI (`components/SubmitArticle.tsx`) switches to a manual entry form with an amber callout.

---

## No join on auth.users in PostgREST queries

Supabase's PostgREST layer does not expose `auth.users`. Any query like `select("*, submitter:submitted_by(email)")` will fail silently — the feed returns empty with no error.

We store `submitted_by` as a UUID and compare it client-side against the current user's ID for ownership checks (`isOwner` in `ArticleCard.tsx`). For display names we mirror what we need into `public.profiles`, kept in sync by a signup trigger (`supabase/profiles-schema.sql`) — the standard Supabase pattern for this limitation.

---

## Feed: server-rendered first page, shallow tag updates

`app/feed/page.tsx` fetches the initial article list server-side (shared logic in `lib/articles.ts`) so the feed shows content immediately instead of skeletons. `FeedClient` seeds state from props and skips its first client fetch via a ref guard.

Tag filtering updates the URL with `window.history.replaceState`, not `router.replace` — the native call syncs `useSearchParams` without an RSC round-trip, so a tag click triggers exactly one fetch (client-side). Using `router.replace` would refetch the page server-side AND client-side.

---

## Scroll detection: event listener over IntersectionObserver

The sidebar active state (`activeSection` in `FeedClient.tsx`) uses a `scroll` event listener checking `getBoundingClientRect().top <= window.innerHeight / 2`. An earlier IntersectionObserver approach failed to re-activate "Articles" when scrolling back up because the rootMargin was too narrow to catch the transition reliably.

---

## Nods: single batch query, not N+1

`GET /api/articles` fetches all nods for the returned article set in one `.in("article_id", articleIds)` query, then merges `nod_count` and `user_has_nodded` in JS. Avoids a subquery or join per article.

---

## RSS paid article detection

`app/api/author-articles/route.ts` uses a `isPaywalled()` heuristic that covers:
- **Stratechery** (Ben Thompson): checks for `"Daily Update"` in RSS `<category>` fields
- **Derek Thompson / Substack**: checks description text for `"thank you for being a paid subscriber"`
- **Fallback**: description under 80 characters is treated as paywalled (paid posts often show a truncated teaser)

---

## Derek Thompson RSS URL

`https://www.derekthompson.org/feed` (no trailing slash). The `/feed/` variant returns a 301 that causes fetch issues. Use the bare URL.

---

## Tags: stored lowercase, displayed with CSS capitalize

Tags are normalized to lowercase on insert. Display uses Tailwind's `capitalize` class. Don't uppercase in JS — it breaks multi-word tags.

---

## Supabase composite primary key for nods

`nods` table has a composite PK of `(article_id, user_id)`. The toggle endpoint (`app/api/nods/route.ts`) does a SELECT to check for an existing nod, then INSERTs or DELETEs accordingly. There is a benign race if the same user toggles twice concurrently (e.g. double-click), but the composite PK makes the duplicate insert fail harmlessly and the client's optimistic UI reverts.
