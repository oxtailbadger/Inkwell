# Inkwell — Architecture Decisions

Non-obvious choices and the reasons behind them. Read this before refactoring anything that "looks wrong."

---

## Design tokens live in app/globals.css's @theme block, not Tailwind config

Tailwind v4 has no `tailwind.config.js` in this project — theme customization happens in CSS via `@theme` in `app/globals.css`. Font-size tokens use Tailwind's paired-variable convention: `--text-{name}` + `--text-{name}--line-height` generates a single `text-{name}` utility setting both properties at once (e.g. `--text-headline: 21px` + `--text-headline--line-height: 1.3` → `text-headline` sets `font-size: 21px; line-height: 27.3px`). Same pattern for `--radius-{name}` → `rounded-{name}` and `--color-{name}` → `bg-{name}`/`text-{name}`/`border-{name}`/etc. When a new design-handoff value doesn't fit an existing token *and has real reuse* (appears identically in more than one place), add a named entry here rather than reaching for `text-[Npx]` bracket syntax. One-off values (a single button's padding, a single unique tracking value) stay as inline arbitrary Tailwind values — not everything needs a token.

For spacing (gap/padding/margin/width/height), don't add new tokens: Tailwind v4's entire spacing scale is `calc(var(--spacing) * N)` off a single `--spacing: 0.25rem` base, so **any** fractional multiple works as a plain utility class — `gap-3.25` is exactly 13px, `px-4.5` is exactly 18px, `w-6.5` is exactly 26px. Convert `px-value / 4` to get the class suffix. Verified pixel-exact via computed-style inspection before adopting this over arbitrary-bracket values.

The current `--text-*`/`--radius-*` token set (`headline`, `title-xs`, `body-sm`, `card`, `control`, `tag`, `badge-sm`) is from the 2026-07-08 "Broadsheet" redesign (see next entry) and superseded an earlier amber-theme set with different names/values (`text-title-sm`/`text-title-md`, `radius-badge-lg`, etc.) — if you find old amber-era token names referenced anywhere, they're stale, not a second live system.

---

## Color system: CSS custom properties + explicit [data-theme], not Tailwind color config

The 2026-07-08 "Broadsheet" redesign (design handoff, editorial/newsroom aesthetic) introduced a semantic color system instead of literal Tailwind colors (`bg-white`, `text-gray-900`, `bg-amber-700`, etc.): `--paper`/`--card`/`--card-border`/`--ink`/`--muted`/`--muted-2`/`--accent`/`--accent-hover`/`--accent-tint`/`--tag-bg`/`--tag-border`/`--tag-fg`/`--placeholder-bg`, defined in `:root` for light mode and overridden wholesale in `[data-theme="dark"]` (`app/globals.css`). They're re-exposed as Tailwind utilities via `@theme inline { --color-paper: var(--paper); ... }`, so components use `bg-paper`, `text-ink`, `border-card-border`, etc. — normal Tailwind utility classes that happen to resolve through a CSS variable, not a JS/Tailwind-config color palette.

Dark mode is **explicit** (`data-theme="dark"` on `<html>`, toggled by `components/ThemeToggle.tsx`, persisted in `localStorage["inkwell-theme"]`), not `prefers-color-scheme` — this was a specific instruction in the design handoff ("the app should control theme explicitly... defaulting to light"). Don't switch this to a media query; if the OS-preference behavior is wanted later, it should be an *additional* default-detection step that still writes to the same `data-theme` attribute + localStorage key, so the toggle and persistence keep working.

The flash-of-wrong-theme fix is a blocking inline `<script>` in `app/layout.tsx`'s `<head>` (`THEME_INIT_SCRIPT`) that reads localStorage and sets `data-theme` before first paint — this is the Next-documented pattern (see `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`), not a custom hack. `<html>` has `suppressHydrationWarning` because the script legitimately changes the DOM before React hydrates. `ThemeToggle` reads the actual theme in a `useEffect` (not during render) to avoid a server/client markup mismatch — the tradeoff is the toggle's own label can show the wrong text for one frame on load, which is cosmetic only, since the inline script already applied the correct *colors* before that.

If a new page/component needs to be theme-aware, use the `bg-*`/`text-*`/`border-*` utilities generated from these tokens — never hardcode a Tailwind gray/white/amber class, since it will silently ignore dark mode. `app/login/page.tsx`, `app/error.tsx`, and `app/not-found.tsx` were ported to these tokens on 2026-07-08 too (a day after the main pass) — they have no theme-toggle button of their own, but correctly inherit whatever theme was last set (the inline init script in `layout.tsx` runs on every page, not just `/feed`), so a user who switched to dark mode and later signs out sees a dark-mode login page, not a jarring flash back to light.

---

## Font roles inverted in the Broadsheet redesign: Work Sans is primary, Cormorant Garamond is meta-only

Before 2026-07-08, Cormorant Garamond (`font-display`) was used for headlines/titles and the default sans (then Space Grotesk) for everything else. The Broadsheet handoff **inverts this**: Work Sans (now `--font-sans`, replacing Space Grotesk in `app/layout.tsx`) is used for all titles, body text, buttons, and the wordmark; Cormorant Garamond is now used *only* for small-caps meta/eyebrow text — site names, section labels ("From the Authors"), topic tags, category labels, and dates/bylines, always uppercase with letter-spacing. If you're adding a new heading or title anywhere in the app, it should default to the base sans font (no `font-display` class); only apply `font-display` to genuinely secondary/label-role text, and pair it with `uppercase tracking-wide` (or `tracking-widest`/an arbitrary tracking value) — Cormorant Garamond in mixed-case at body size looks like a mistake, not a style choice.

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

---

## signInWithOtp uses shouldCreateUser: false

`app/login/page.tsx` passes `shouldCreateUser: false` to `supabase.auth.signInWithOtp`. Access is meant to be allowlist-only (emails added manually in the Supabase dashboard), but without this flag `signInWithOtp` will silently create a brand-new account for any email typed in, entirely dependent on the unversioned "allow new signups" dashboard toggle staying off. This closes the client-side half of that gap; the RLS/allowlist-in-code half is still open (see `BACKLOG.md` — "Enforce the access model in code, not dashboard config").

---

## Env vars are validated at server startup via instrumentation.ts

`instrumentation.ts` (root) exports `register()`, which Next 16 calls once when a new server instance boots (Node and Edge runtimes both — `proxy.ts` runs on Edge). It checks `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are present and throws a clear error naming the missing var(s) if not. Before this, a missing env var only surfaced as a cryptic crash the first time `process.env.X!` was dereferenced deep inside `lib/supabase/{client,server,middleware}.ts` — now it fails immediately and legibly at boot. If more required env vars are added later (e.g. a custom SMTP key), add them to `REQUIRED_ENV_VARS` in this file rather than adding another bare `!` assertion somewhere.

---

## Structured logging: route handlers log through lib/logger.ts

`lib/logger.ts` exports `logInfo`/`logWarn`/`logError`, thin wrappers around `console.*` that enforce the `[route-name]` prefix convention `fetch-og`/`archive-check`/`author-articles` already used ad hoc. `dbErrorResponse` (`lib/api-errors.ts`) and `fetchEnrichedArticles` (`lib/articles.ts`) also route through it now. This doesn't add a log drain or change what's logged — it's the same Vercel-console-log approach as before, just codified so every server log line is consistently greppable by context. `app/error.tsx`'s client-side `console.error("[app-error]", ...)` is intentionally left alone — it logs to the browser console from a client error boundary, a different concern than server route logging.

---

## Pagination: cursor-based, and why nod counts moved into a Postgres view

`lib/articles.ts`'s `fetchEnrichedArticles` used to fetch every article ever posted, then every nod on those articles, and count in JS (O(articles × nods) per request — the original launch-blocker finding). As of 2026-07-09 it takes `{ limit, cursor }` and returns `{ articles, nextCursor }`.

**Cursor, not offset/limit:** the cursor is an opaque base64 encoding of `{created_at, id}` (`encodeCursor`/`decodeCursor` in `lib/articles.ts`), not a page number. Offset pagination breaks the moment the underlying row set can shrink between two requests — which is exactly what dismissed articles do (see below) — silently double-counting or skipping rows. `created_at` alone isn't a safe sort key either (two articles can share a timestamp), so `id` is a tie-breaker: `order(created_at desc).order(id desc)`, plus one extra row fetched past `limit` purely to know whether a next page exists.

**Cursor contents are validated, not just shape-checked.** Both decoded values are string-interpolated into a PostgREST `.or()` filter, so `decodeCursor` requires a real UUID and a real ISO timestamp — a hand-crafted cursor with filter syntax inside (`x,id.not.is.null`) must be rejected at the trust boundary (same doctrine as `lib/validate.ts`), not passed through because it happens to be a string.

**The tag-filter bar gets its own query (`fetchAllTags`).** Pre-pagination, the bar derived its tag list from the loaded articles — which was all of them. Post-pagination that silently regressed to "tags on the first page only," so the full distinct-tag list now comes from one dedicated tags-column-only query on the server-rendered page, unioned client-side with tags from loaded articles so a just-submitted tag appears without a reload.

**Nod counts: a Postgres view (`article_nod_counts`, `supabase/nod-counts-view.sql`), not a JS loop.** `count(*) group by article_id` in Postgres, queried the same way the old raw-`nods` batched query was (`.in("article_id", pageArticleIds)`) — same call shape, pre-aggregated result. Views inherit the base table's RLS for reads but still need an explicit `grant select ... to authenticated`, or the query 42501s. Nod counts stay public (matching existing behavior) since `nods`' own RLS already allows any authenticated user to read.

**Operational note:** `fetchEnrichedArticles` queries this view unconditionally — if `article_nod_counts` (or `article_state`, see below) is ever dropped or missing in an environment, `GET /api/articles` and the server-rendered `/feed` page break for everyone, not just the pagination/save-read-dismiss features. Both were created via `supabase/nod-counts-view.sql` / `supabase/article-state-schema.sql` in production on 2026-07-09.

---

## Save / Read / Dismiss: one table + one action-discriminated endpoint, dismiss excluded server-side

Per-user article state (`saved`, `read`, `dismissed` — 2026-07-09) lives in one `article_state` table (`supabase/article-state-schema.sql`), composite PK `(article_id, user_id)` like `nods`, but with RLS scoped to `auth.uid() = user_id` on every policy (including `select`) — unlike `nods`, this state is private, not a public count. It also has an `update` policy that `nods` doesn't need, since this table upserts once and then flips individual columns rather than being inserted-or-deleted as a whole row.

**One `PATCH /api/article-state` endpoint, action-discriminated** (`{ article_id, action: "save"|"unsave"|"read"|"unread"|"dismiss"|"undismiss" }`) instead of three near-duplicate routes or a generic multi-field PATCH. The explicit action names document that dismiss/undismiss is an asymmetric flow (paired with a client-side undo window) rather than just another boolean flip. The route sets `updated_at` explicitly in every upsert payload — a partial upsert only writes the columns it names, so the column's DB default fires on first insert only and would otherwise freeze at creation time.

**Dismissed articles are excluded at the query level, not filtered client-side.** `fetchEnrichedArticles` looks up the caller's dismissed article IDs first and applies `.not("id", "in", ...)` to the main articles query before pagination math runs. This was decided *before* writing the pagination code, not bolted on after — filtering dismissed rows client-side after the fact would make `loadMore()`'s page sizes wrong (a page of 24 minus a few dismissed renders as fewer than 24, and cursor math would need to account for skipped rows it can't see). Note this lookup is **unbounded over time** — it fetches every article ID the user has ever dismissed, on every feed request, and ships them back as a URL filter. Fine at friend-group scale (same reasoning as the in-memory rate limiter), but at public scale it should become a DB-side anti-join via a view or RPC — tracked in `BACKLOG.md`. The saved-only lookup has the same shape and the same caveat.

**Dismiss commits immediately; there's no delayed server-side commit.** The kebab menu's Dismiss action fires the `PATCH .../dismiss` write immediately (optimistic UI, revert-on-failure — same pattern as the existing nod toggle), *before* the undo toast even appears. The 4.5s toast window with an Undo button (`components/Toast.tsx`, state owned by `FeedClient`) only controls how long Undo stays available client-side; clicking it fires a compensating `PATCH .../undismiss`. A delayed-commit approach (write only after the toast expires) was considered and rejected: `lib/rate-limit.ts`/`lib/server-cache.ts` already document that in-memory per-instance state doesn't survive cold starts or span concurrent instances, and a pending dismiss-write is exactly that kind of state — it could fire on a different instance than the one that receives the Undo click, or vanish on a redeploy.

**The toast's colors are hardcoded, not theme tokens — on purpose.** `components/Toast.tsx` uses literal `bg-[#17130f] text-[#fffdfa]`, not `bg-ink text-paper`. The design spec calls for the Undo button to always be `#7fcf9e` (the dark-mode accent tone) "for contrast against the dark toast regardless of page theme" — but `--ink`/`--paper` themselves flip in dark mode (`--ink` becomes the *light* color), so using those tokens would invert the toast to a light background in dark mode and make the hardcoded green Undo text nearly unreadable. Caught by testing the dismiss flow in dark mode during this feature's verification, not by reading the spec text alone — the spec's token names and its own stated intent were in tension, and intent won.

---

## Destructive/error red is a theme token (`--danger`), deviating from the spec's single literal

The Broadsheet handoff specifies one literal warm red, `#a13f2e`, for destructive actions, and the app also had leftover Tailwind `red-*` classes (error banners, Remove button, form errors) that rendered as light-mode elements on dark pages. Both are now `--danger`/`--danger-tint`/`--danger-border` tokens in `app/globals.css` — `#a13f2e` in light mode exactly as spec'd, a lighter `#e0917c` in dark mode where the literal would sit at poor contrast against near-black cards. Same intent-over-literal reasoning as the toast entry above. Use `text-danger`/`bg-danger-tint`/`border-danger-border` for anything destructive or error-flavored; don't reach for Tailwind's `red-*` scale.

---

## "Saved" filter is a standalone toggle, ANDed with the tag filter — not mutually exclusive

`FeedClient.tsx`'s `?saved=1` URL param (2026-07-09, closes the "Saved filter/view" backlog item) is independent of `?tag=`, unlike "All" vs. a tag which are mutually exclusive with each other. Clicking the 🔖 Saved pill toggles `saved=1` on/off while preserving whatever tag is active, so "Saved articles tagged Tech" is a reachable state, not just "Saved" or "Tech" alone. The tag-pill row and the Saved toggle are visually separate rows for this reason — they read as two independent filter dimensions, not one row of mutually-exclusive options.

`fetchEnrichedArticles`'s `savedOnly` option looks up the caller's saved article IDs first (same bounded-lookup idiom as the dismissed-exclusion filter) and short-circuits to an empty result *without querying the articles table at all* when nothing is saved — cheaper than running the full paginated query only to filter it down to nothing. When something is saved, the IDs are applied via `.in("id", savedIds)` alongside the existing tag/dismissed/cursor filters, so pagination, dismiss-exclusion, and the saved filter all compose correctly together (e.g. a dismissed-and-saved article still doesn't show up in the Saved view — dismissed wins, see the entry above).

---

## Profile page reuses `profiles.display_name` as "username" — no new column

The 2026-07-09 Profile page (`app/profile/`) needed an editable username. `public.profiles.display_name` already exists, already defaults to the email prefix via the signup trigger, and is already RLS-scoped so a user can only update their own row (`supabase/profiles-schema.sql`) — exactly what was asked for. No migration. `PATCH /api/profile` validates via `lib/validate.ts`'s `validateText` (new `LIMITS.DISPLAY_NAME`, 60 chars) plus an explicit non-empty check on top, since `validateText` treats `""` as "no change" (`null`) but this column is `not null` — an empty submission here is a required-field error, not a legitimate clear-the-field request.

The header avatar (a first-letter monogram linking to `/profile`, `app/feed/FeedClient.tsx`) derives its letter from `display_name`, not the email prefix, for consistency with everywhere else a user's name is already shown (`AuthorFeed`/`ArticleCard` bylines both use `display_name`) — two different "identity strings" for the same person in the same header would read as a bug. This is the one new piece of server-side plumbing the feature needed: `app/feed/page.tsx` didn't fetch `profiles` before; it now does, alongside the existing articles/tags queries, in the same `Promise.all`.

---

## Theme read/write extracted into `lib/useTheme.ts`, shared by the header toggle and the profile settings

`ThemeToggle.tsx` (header, a single "click to switch" button) and the profile page's theme selector (an explicit Light/Dark segmented control — a better fit once the user is looking at a settings page, not just a toolbar) need the identical underlying behavior: read `data-theme` from the DOM in an effect, write it back plus `localStorage["inkwell-theme"]` on change, wrapped in try/catch for storage-disabled environments. Rather than duplicate that logic, it's a small hook (`useTheme`) both components call — `ThemeToggle` is now a thin two-line consumer. Both surfaces read/write the exact same key, so toggling in one place is immediately reflected if the other is opened next (they're never mounted simultaneously — different routes — so no cross-component sync was needed, just shared logic).

---

## FAQ is a native `<details>`/`<summary>` accordion — no state, no library

No accordion/modal/dropdown component existed anywhere in this codebase before the profile page. Rather than introduce one, the FAQ (`app/profile/ProfileClient.tsx`) uses plain `<details>` elements — collapsed by default (no `open` attribute), free keyboard/click toggling and accessibility from the browser, zero JS state to get wrong. The chevron rotation on expand is a pure-CSS `group-open:rotate-180` Tailwind selector, not a state-driven className. Adding a new FAQ entry later is just appending `{ question, answer }` to the `FAQ` array in that file — no component changes needed unless an answer needs the same kind of special-cased rich content (a link, in this case) as the share-flow entry, which is handled with a small `answer === "android-ios"` branch rather than making every entry's answer accept arbitrary JSX.

---

## Read and Dismissed views (2026-07-10) generalized the Saved filter's plumbing instead of copy-pasting it

Adding `?read=1` and `?dismissed=1` alongside the existing `?saved=1` was the point at which three near-identical "fetch article IDs where `article_state.<column>` is true, short-circuit to empty if none" blocks would have existed in `fetchEnrichedArticles`. Extracted into one `fetchStateIds(supabase, userId, column)` helper instead. All three toggles are independent and ANDed together (not mutually exclusive with each other or with the tag filter) — matching how Saved already worked, per the explicit ask to follow that convention. When more than one is active, their ID lists are intersected (`intersectIdLists`), not unioned, so "Saved + Read" means articles that are both, not either — a friend-group feed is small enough that array `.includes()` intersection is fine; this would want a real join if it ever needed to scale.

**Dismissed is the one asymmetric case.** Every other view adds a `.in("id", onlyIds)` restriction on top of the *existing* default exclusion of dismissed articles. Dismissed itself can't work that way — "show only what's dismissed" and "hide what's dismissed" are contradictory if both apply — so `dismissedOnly` does two things at once: it repurposes the same `dismissedIds` list already being fetched for the default exclusion (no second query) as an inclusion filter instead, and it skips the exclusion step entirely (`if (!dismissedOnly && dismissedIds.length > 0)`). This was designed as one codepath from the start, not bolted on, specifically because getting this ordering wrong (excluding *and* requiring dismissed=true) silently returns zero rows forever.

**The kebab menu's Dismiss row becomes "↺ Restore" when `article.dismissed` is true**, calling `undismiss` directly instead of `dismiss` (`components/ArticleCard.tsx`, new `onUndismiss` prop). This closes a real gap the Dismissed view would otherwise have: the *only* prior way to reverse a dismiss was the ~4.5s Undo window on the toast at the moment of dismissing (see the Dismiss/Undo entry above) — with no Dismissed view, there was nowhere to go looking for something dismissed five minutes (or five days) ago. Restore intentionally skips the toast/undo-grace-period pattern: it's the corrective action undoing an earlier destructive one, not itself something that needs a second safety net.

---

## Header theme control is a sun/moon pill switch, not a text-label button

`ThemeToggle.tsx` (2026-07-10) changed from a button whose label named the *other* mode ("Dark" when currently light) to a pill switch — sun and moon glyphs fixed at each end of the track, a circular knob sliding between them (`translate-x-0`/`translate-x-6`, `role="switch"` + `aria-checked`). The old text-label version reads as a status readout on first glance ("it says Dark, is that the current mode or the mode I'll get?"); a switch with a knob is unambiguous at a glance. The profile page's theme control (`app/profile/ProfileClient.tsx`) is intentionally left as an explicit two-button Light/Dark selector, not this pill — a labeled selector reads better in a settings-page context, a compact glance-able switch reads better in a persistent header. Both still go through the same `lib/useTheme.ts` hook.

The knob uses `bg-ink` (not a new token) specifically because that token already flips light/dark with the theme — a dark knob on the light-mode pale track, a light knob on the dark-mode near-black track, both against the same `bg-card` track color. Same mechanism already relied on for the header avatar and site-badge monograms; no new color decision needed here.

---

## Tests are logic-level (direct function calls + hand-built Supabase mocks), never DOM-rendered

Every file in `__tests__/` (14 as of 2026-07-10, one per API route or `lib/` module, flat — not colocated with source) follows the same shape: API routes are imported and called directly (`POST(makeRequest(...))`, a real `NextRequest` built by a small local `makeRequest` helper, no server actually running); `page.tsx` server components are called directly as async functions, with `next/navigation`'s `redirect` mocked to `throw` (matching production — `redirect()` really does throw `NEXT_REDIRECT` — so a test can `expect(...).rejects.toThrow(...)` instead of needing a try/catch wrapper *and* the page's own control flow after a redirect call is exercised for free, not skipped). Nothing in this repo uses `@testing-library/react` or renders a component to a DOM — verifying visual/interactive behavior (does the kebab menu actually open, does the toast actually animate) happens via the `preview_*` MCP tools against a real running dev server instead, not unit tests. Don't introduce a DOM-render test library without a real need; the existing convention has covered every feature added so far, including fairly stateful client components (`ArticleCard`, `FeedClient`).

Supabase is never mocked generically — each test file hand-builds a chainable fake object matching the *exact* method-call shape the code under test issues (e.g. `.select().eq().eq()` vs `.select().eq().in()` are different fakes, disambiguated by inspecting which column/args were passed if the same table serves two different query shapes — see `article_state`'s handling in `__tests__/articles-lib.test.ts`). This is more verbose than a generic mock but catches real shape mismatches (a code change that adds an unexpected `.order()` call breaks the test immediately, rather than a generic mock silently accepting any chain). `vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))` at module scope, then `vi.mocked(createClient).mockResolvedValue(fakeSupabase as never)` per test, `beforeEach(() => vi.clearAllMocks())`.

---

## QuillIcon recolored to a single-stroke `var(--accent)` mark, replacing the amber/gold multi-path feather

`components/QuillIcon.tsx` (2026-07-10) went from an 8-shape amber/gold feather (hardcoded hex fills/strokes, ink drop, barb lines) to a two-path minimalist quill — a solid leaf-shaped nib plus one flourish stroke, both colored with `var(--accent)` directly rather than a Tailwind class. Origin: a marketing flyer mockup (asking for beta testers) used a simpler green quill that read better at small sizes and matched the Broadsheet palette instead of clashing with it; the app's own logo was updated to match once the user preferred it over the original. Using the raw CSS variable instead of a `text-accent`/`fill-accent` Tailwind class keeps the component prop-free (no need for callers to also set text color) while still tracking the same token that flips in dark mode — verified in both themes via `preview_*` before landing. This closes the "Recolor QuillIcon for the new palette" item that had been deliberately deferred in BACKLOG.md since the Broadsheet redesign.

The static icon assets (`app/icon.png`, `app/apple-icon.png`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`) were regenerated to match, since none of them can reference `var(--accent)` — they're standalone rasters/SVGs served outside the app's CSS, so the new fill is baked in as the light-theme accent hex (`#1f4d36`) on the light-theme paper hex (`#f7f5f0`) rather than tracking dark mode. Same padding/mask conventions as before: `app/icon.png` keeps its baked-in rounded-square clip (browser tab favicon), `app/apple-icon.png`/`public/icon-*.png` stay plain squares (iOS and Android apply their own masking), all centered at the same ~60%-of-canvas scale the previous quill used.

---

## The `article_nod_counts` view is `security_invoker = true`, not the Postgres default

Postgres views run against their underlying tables in one of two security contexts. The historical default (and what Supabase creates unless told otherwise) is effectively SECURITY DEFINER: the view queries `nods` as the *view owner* (`postgres`), which **bypasses the querying user's RLS** on `nods`. `security_invoker = true` (Postgres 15+, set in `supabase/nod-counts-view.sql`) flips that — the view reads `nods` as the *calling user*, so `nods`'s own RLS policies still apply. Supabase's database linter flags every DEFINER-context view, which is where this came from (2026-07-10).

For this view specifically the practical risk was nil: nod counts are public by design, and `nods`'s SELECT policy is `using (true)` for all authenticated users, so nothing leaked that wasn't already readable. It's set correctly anyway because DEFINER views are a latent trap — the "hide nod counts for anonymity" idea in BACKLOG.md would tighten `nods`'s RLS, and a DEFINER view would silently keep leaking the aggregate counts straight past that new policy. **Any future view or `SECURITY DEFINER` function added here should default to `security_invoker`/invoker semantics unless there's a deliberate, documented reason to run as owner** — the whole point of the app's `using (true)`-today / tighten-later RLS posture is that views must not become a hole around it. An earlier version of the view's own header comment claimed "views inherit RLS from their underlying tables," which is precisely the misconception the linter exists to catch; that comment is now corrected in place.

---

## Theme preference is per-device (localStorage), deliberately not saved to the account

The light/dark choice lives only in `localStorage["inkwell-theme"]` on the device that set it — there is no `theme` column on `profiles` and the setting is never written to the database, despite the profile page presenting it next to `display_name` (which *is* DB-backed). This was a considered choice (2026-07-10, when the persistence was questioned): the friend-group audience overwhelmingly uses one device each, an account-backed theme means a schema migration plus loading it server-side on every page to apply it before paint (a second source of truth that has to stay in sync with the fast-path localStorage read the inline script in `layout.tsx` already depends on), and getting that wrong reintroduces exactly the flash-of-wrong-theme the inline script exists to prevent. The cost/benefit didn't favor it for this audience. If a user reports "my theme didn't stick," the near-certain cause is a *different* browser/device or cleared site data, **not** a refresh bug — same-browser refresh persistence was verified working (the inline script reads localStorage before first paint). The tradeoff is documented in BACKLOG.md as a future option, and the release notes were corrected to say "remembered per device" rather than the earlier "save the setting in your profile," which wrongly implied account storage.

`useTheme.ts` also listens for the `storage` event so that a change made in one tab (e.g. on the profile page) propagates live to other open tabs of the same origin (e.g. a feed tab), not just on their next refresh — the `storage` event only fires in *other* tabs, so the tab that made the change is already handled by `setTheme` itself. This is consistency hardening, not persistence: single-tab refresh already worked without it.
