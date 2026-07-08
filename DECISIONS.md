# Inkwell — Architecture Decisions

Non-obvious choices and the reasons behind them. Read this before refactoring anything that "looks wrong."

---

## Design tokens live in app/globals.css's @theme block, not Tailwind config

Tailwind v4 has no `tailwind.config.js` in this project — theme customization happens in CSS via `@theme` in `app/globals.css`. Font-size tokens use Tailwind's paired-variable convention: `--text-{name}` + `--text-{name}--line-height` generates a single `text-{name}` utility setting both properties at once (e.g. `--text-title-sm: 18px` + `--text-title-sm--line-height: 1.3` → `text-title-sm` sets `font-size: 18px; line-height: 23.4px`). Same pattern for `--radius-{name}` → `rounded-{name}` and `--tracking-{name}` → `tracking-{name}`. When a new design-handoff pixel value doesn't fit an existing token, add a new named `--text-*`/`--radius-*`/`--tracking-*` entry here rather than reaching for `text-[Npx]` bracket syntax — that's what these tokens replaced (2026-07-08 design-system pass).

For spacing (gap/padding/margin/width/height), don't add new tokens at all: Tailwind v4's entire spacing scale is `calc(var(--spacing) * N)` off a single `--spacing: 0.25rem` base, so **any** fractional multiple works as a plain utility class — `gap-3.25` is exactly 13px, `px-4.5` is exactly 18px, `w-6.5` is exactly 26px. Convert `px-value / 4` to get the class suffix. This was verified pixel-exact via computed-style inspection against the previous `gap-[13px]`-style arbitrary values before adopting it.

`font-display` was already a valid theme token (`--font-display` in the `@theme inline` block, wired to the Cormorant Garamond variable in `app/layout.tsx`) but nothing used the generated `font-display` utility class — every call site used an inline `style={{ fontFamily: "var(--font-display)" }}` instead, for no reason found in history. All of those are now `className="font-display"`.

---

## Rate limiting and caching are in-memory and per-instance, on purpose

`lib/rate-limit.ts` (fixed-window counter) and `lib/server-cache.ts` (TTL cache) hold state in module-level Maps, not Upstash/Vercel KV. That means: counters and caches reset on serverless cold starts and are not shared across concurrent instances. This was chosen knowingly — external KV requires provisioning a service and env vars, and at ~10 trusted users the threat model is one user (or a script with their cookie) rapidly hammering `/api/fetch-og` (Microlink quota) or `/api/archive-check` (archive.ph IP-range blocking), and rapid repeats land on the same warm instance. Don't "fix" the non-shared state at beta scale; when the app opens up, swap the Maps for Redis behind the existing `checkRateLimit()` / `TTLCache` interfaces — callers don't change.

Cache policy is asymmetric by design: fetch-og caches successes and `EPROXYNEEDED` antibot blocks (both deterministic per URL) but never transient failures; archive-check caches found=true only (snapshots are permanent; found=false can flip the moment someone archives the page). Cache hits are served before the rate-limit check, so they're free.

---

## proxy.ts, not middleware.ts

Next 16 renamed the middleware.ts file convention to proxy.ts (the exported function must be named `proxy` or be the default export). The Supabase session-refresh helper it calls kept its old name (`lib/supabase/middleware.ts`, exporting `updateSession`) since that's an ordinary module, not a framework special file — no reason to churn it.

---

## DELETE ownership check requires a lookup, not just a filtered delete

`DELETE .eq("id", id).eq("submitted_by", user.id)` doesn't error when zero rows match — it's just a no-op delete, which used to mean a non-owner's delete request got `{ success: true }` despite nothing being removed. `POST /api/articles`'s sibling DELETE now does a `select("submitted_by").eq("id", id).maybeSingle()` lookup first to return an honest 404 (article doesn't exist) vs 403 (exists, not yours) before attempting the delete. If you add DELETE/UPDATE endpoints elsewhere with an ownership filter, use the same lookup-first pattern rather than trusting a filtered mutation's silence.

---

## Auth callback only redirects to same-origin relative paths

`app/api/auth/callback/route.ts` builds the post-login redirect as `${origin}${next}`, string concatenation rather than `new URL(next, origin)`. That matters: a `next` value like `@evil.com` (no leading slash) concatenated onto `origin` produces `https://ourdomain.com@evil.com`, which parses as host `evil.com` via userinfo confusion — a real open-redirect vector, not just theoretical hardening. `safeNextPath()` only accepts values starting with a single `/` (rejecting `//evil.com` and `/\evil.com` too, both protocol-relative tricks); anything else falls back to `/feed`. If `next` is ever passed through `new URL()`/`router.push()` instead of raw concatenation, this guard should move with it — the risk lives in "untrusted string becomes part of a redirect target," not in this specific route.

---

## Server-side URL/text validation lives in lib/validate.ts, only on POST /api/articles

`lib/validate.ts` enforces http/https-only URLs (rejects `javascript:`, `data:`, etc.) and length caps on title/description/site_name/tags. It's wired into `POST /api/articles` only — not `fetch-og` or `archive-check`, whose `url` params are outbound-fetch targets, not stored/rendered values, and not `GET`'s `tag` query param, which only feeds a `.contains()` filter. If a future session adds a new writable field to `articles` (or a new table with URL/text columns), route it through these helpers rather than trusting client input directly — this is the app's actual trust boundary now that beta access is opening up.

`ValidationError` thrown from these helpers maps to a 400 with the thrown message as-is (safe to show the user — it never contains raw input or DB internals). Genuine DB failures go through `lib/api-errors.ts`'s `dbErrorResponse`, which logs the real Postgres/Supabase error server-side and returns a fixed friendly string — never `error.message` directly to the client. Apply `dbErrorResponse` to any new route that touches the database.

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

## Article card: "Archive" renamed to "Read free", Nod pill is always amber

Per the article-card design handoff (2a, 2026-07-06), `article.archive_url` is now labeled "Read free ↗" everywhere it's a reader-facing link — "Archive" tested as ambiguous (reads as save-this, not bypasses-the-paywall). This is the only place that label existed; `SubmitArticle.tsx`'s "Find snapshot"/"Create one" links are a different action (locating/creating a snapshot) and intentionally keep their own wording.

The Nod button in `ArticleCard.tsx` always renders the amber pill now, regardless of `hasNodded` — before, un-nodded was plain white/gray and nodded was amber. The toggle state is now communicated only by the ✦/✧ glyph and count. This was an explicit instruction in the handoff, not a bug — don't reintroduce the two-color state.

---

## Authors card design deviates from the handoff on two fields

`AuthorFeed.tsx`'s card header follows `design_handoff_authors_section/author-card.html` (Claude Design handoff, 2026-07-06) with two intentional deviations, since the handoff's example assumed a single Substack author and our `authors` table doesn't carry a separate publication name:
- Meta line shows article count ("3 articles") instead of "Publication · count" — no publication-name column exists, only `name`, `rss_url`, `website_url`.
- The pill button label is derived from the domain (`Read on stratechery.com`, or `Read on Substack` for `*.substack.com` hosts) rather than hardcoded "Substack" — most seeded authors aren't on Substack.

The header row uses `flex-wrap` (not a plain `flex` row as in the reference) because at 2-column card widths — roughly viewport 640–1024px, where the sidebar is hidden but `sm:grid-cols-2` is active — the fixed-width button crowded author names into truncation. The button now drops to its own line under the name/meta block when space is tight; verified at mobile, that tablet range, and wide desktop.

---

## OTP code login exists for the iOS PWA

The login page offers "enter the code from the email" alongside the magic link (`verifyOtp` with `type: "email"`). This is not cosmetic: iOS home-screen web apps run in an isolated storage container, so a magic link tapped in email opens the default browser and the session lands there — it can never reach the PWA. Typing the code inside the PWA creates the session in the PWA's own container. **Requires the Supabase Magic Link email template to include `{{ .Token }}`** (Dashboard → Authentication → Email Templates); without it the email contains no code and the form is useless. Auth is cookie-based via @supabase/ssr with server-side refresh in middleware — don't switch to localStorage-based clients, and don't "fix" multi-tab sign-out reports by touching the client; check JWT expiry (raised in dashboard) and this PWA isolation issue first.

---

## PWA share target: Android-only by platform limitation

`app/manifest.ts` registers a Web Share Target (`/share`, GET). This only works on Android with the PWA installed — iOS has no share_target support, so iOS users need a Shortcut that opens `/share?url=`. The `/share` page scans `url`, `text`, and `title` params for the first http(s) URL because Android apps are inconsistent about which field carries the link (many put it in `text` with commentary around it). The middleware matcher explicitly excludes `manifest.webmanifest` — browsers fetch it without auth cookies, and an auth redirect there silently breaks installability. No service worker: Chrome no longer requires one for install, and we don't need offline.

---

## Archive.today auto-suggest: best-effort by design

archive.today has no official API. `archive.ph/newest/{url}` 302-redirects to the newest snapshot, which `app/api/archive-check/route.ts` reads via a manual-redirect fetch. But their anti-bot layer 429s non-browser clients — observed even from a residential IP with a browser User-Agent (2026-07-02), so it's likely TLS fingerprinting, and Vercel IPs will fare no better. The route therefore treats every failure as `{ found: false }` and the form falls back to two pre-filled links ("Find snapshot" → `/newest/{url}`, "Create one" → `/?url=`). Do not add retries or proxies here; the links are the reliable path and the auto-fill is a bonus when it works. Check Vercel logs for `[archive-check]` to see real-world hit rates.

---

## Derek Thompson RSS URL

`https://www.derekthompson.org/feed` (no trailing slash). The `/feed/` variant returns a 301 that causes fetch issues. Use the bare URL.

---

## Tags: stored lowercase, displayed with CSS capitalize

Tags are normalized to lowercase on insert. Display uses Tailwind's `capitalize` class. Don't uppercase in JS — it breaks multi-word tags.

---

## Supabase composite primary key for nods

`nods` table has a composite PK of `(article_id, user_id)`. The toggle endpoint (`app/api/nods/route.ts`) does a SELECT to check for an existing nod, then INSERTs or DELETEs accordingly. There is a benign race if the same user toggles twice concurrently (e.g. double-click), but the composite PK makes the duplicate insert fail harmlessly and the client's optimistic UI reverts.
