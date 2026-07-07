# Inkwell — Backlog

Items are roughly ordered by priority within each section. Move things between sections freely as priorities shift.

---

## Beta polish (small, high impact)

- [x] **Mobile sidebar** — done (2026-07-02). Fixed bottom nav bar on mobile with the same Articles/Authors links and active state.
- [x] **Show who shared** — done via `profiles` table (2026-07-02); SQL has been run in Supabase. Display names default to the email prefix; custom display-name editing deliberately not supported for now (Paul's call).
- [x] **Tag filter persistence** — done (2026-07-02). Tag lives in `?tag=` via shallow history updates.
- [x] **Empty tag state** — done (2026-07-02). Shows "No articles tagged yet" with a button back to All; the tag bar stays visible on empty results so "All" is always reachable.

---

## Features

**Suggested sequencing (noted 2026-07-02):** Pull quotes and the bookmarklet are the smallest items — both build on things that already exist (the articles table and the `/share` route respectively) and are good quick wins. If comments are the eventual goal, build **save-for-later + mark-as-read before comments**: it introduces the app's first per-user private state (a per-user, per-article table with RLS scoped to the owning user, unlike nods which are readable by everyone), and comments can then reuse those table/RLS patterns. Reader view should stay last — highest effort, and full-text search gets more valuable if it lands (article body becomes searchable).

- [x] **PWA + Web Share Target** — done (2026-07-02). Installable PWA; on Android the installed app appears in the system share sheet (works from native apps like The Atlantic). iOS doesn't support share_target — users there install a one-time Shortcut that passes the URL to `/share?url=`. Shared links land on /feed with the form open and preview auto-fetched.
- [ ] **Add more curated authors** — the `authors` table in Supabase drives the feed. Easy to add new RSS feeds without a code deploy. Candidates: Ezra Klein, Matt Levine (Bloomberg), The Economist briefing.
- [ ] **Article comments / reactions** — a lightweight text reply thread per article so friends can discuss without a group chat.
- [ ] **Weekly digest email** — a cron-triggered email (Resend or Postmark) with the top-nodded articles from the past 7 days.
- [ ] **Full-text search** — search across everything ever shared, title + description (article body if Reader view lands). Postgres `tsvector`/`tsquery` with a GIN index makes this nearly free on Supabase; the group's collective memory ("what was that shipping piece from last year?").
- [ ] **Pull quotes** — let the sharer attach a highlighted sentence when submitting ("this is the paragraph that made me send this"). New nullable `pull_quote` column on articles + a textarea in SubmitArticle + styled blockquote on the card. Cheap to build, answers "why should I read this?"
- [ ] **Save for later + mark as read** — two per-user, per-article flags (private, unlike Nods): a personal reading queue ("Saved" filter or sidebar section) and a read marker so users can track what they've gotten through. One `article_flags` table with composite PK (article_id, user_id) and boolean/timestamp columns covers both.
- [ ] **Bookmarklet or browser extension** — desktop capture friction. Start with a bookmarklet (an afternoon: a `javascript:` link that opens `/share?url=` + current page URL — reuses the Web Share Target landing route as-is); only graduate to a Chrome extension if the group wants context menus or one-click submit.
- [ ] **Reader view** — parse article text server-side (Mozilla Readability) and offer a clean in-app reading page. Highest-effort item here and legally gray for paywalled content; pairs with the archive.is habit. Only build if testers ask for it.
- [ ] **Update user email** — let a signed-in user change their login email. Supabase supports `auth.updateUser({ email })` with a confirmation link to the new address; needs a small settings page/modal plus handling for the confirmation state. Note: display names derive from the original email prefix at signup, so decide whether an email change should refresh `profiles.display_name`.
- [x] **Archive.is auto-suggest** — done (2026-07-02). `/api/archive-check` tries to pre-fill an existing snapshot on Preview; archive.today's anti-bot layer 429s most automated lookups, so the reliable path is the "Find snapshot" / "Create one" pre-filled links in the form. See DECISIONS.md before touching this.

---

## Path to public launch

Findings from the full acquisition-style code review (2026-07-07, full details in that session's review). These are the changes needed to take Inkwell from a trusted-friends beta to a public-scale launch. Ordered by priority within each tier.

### Launch blockers — do before any public exposure

- [ ] **Enforce the access model in code, not dashboard config** — `signInWithOtp` in `app/login/page.tsx` doesn't pass `shouldCreateUser: false`, and every RLS read policy is `using (true)` for any authenticated user. Privacy currently depends entirely on the unversioned "allow new signups" Supabase dashboard toggle. Fix: allowlist table checked by RLS, or the invite flow (see Deferred), or at minimum `shouldCreateUser: false` + document the dashboard dependency.
- [ ] **Pagination + DB-side nod counts** — `lib/articles.ts` fetches every article ever posted, then all nods, and aggregates in JS (O(articles × nods) per request). Add limit/cursor pagination to GET /api/articles and move nod counting into Postgres (view or `count(*) group by article_id` RPC). FeedClient needs a "load more" affordance.
- [ ] **Custom SMTP before launch** — auth emails ride Supabase's built-in dev-only sender (a few emails/hour). Set up Resend or Postmark with SPF/DKIM on a real domain; also unblocks the weekly digest feature.

### High priority — survive real users

- [x] **Validate stored URLs server-side** — done (2026-07-07). `lib/validate.ts`: http/https-only URLs, length caps on title/description/site_name, tag count + length caps, server-side tag lowercasing. Wired into `POST /api/articles`. See DECISIONS.md for what's intentionally *not* covered (fetch-og/archive-check outbound URLs, the `tag` filter param).
- [x] **Client-friendly error messages** — done (2026-07-07). `lib/api-errors.ts`'s `dbErrorResponse` logs the real Postgres/Supabase error server-side and returns a fixed friendly string to the client; applied to articles (GET/POST/DELETE), nods, author-articles, and `lib/articles.ts`. fetch-og/archive-check were already generic (external API failures, not DB errors).
- [ ] **Rate limiting + fetch-og caching** — no route has rate limits. Priority: `/api/fetch-og` (burns Microlink quota; also cache successful lookups by URL — every re-preview of the same URL re-hits Microlink) and `/api/archive-check` (archive.ph already 429s; don't get the IP range blocked). Vercel KV / Upstash per-user limits.
- [ ] **CI + broader test coverage** — no `.github/workflows`; tests never run before deploy. Add a GitHub Actions workflow (typecheck + vitest on PR). Then extend coverage to the untested surfaces: nods toggle, fetch-og (the Microlink 200-on-fail semantics), author-articles paywall heuristics (most fragile logic in the app, zero tests), profiles enrichment. Consider a small Playwright smoke suite against a seeded preview deploy — the two worst historical bugs were integration-level and invisible to unit mocks.

### Medium priority

- [x] **Rename middleware.ts → proxy.ts** — done (2026-07-07). Exported function renamed `middleware` → `proxy` per the new convention; matcher regex now has an inline comment explaining every exclusion. Dev boot no longer warns.
- [x] **Rewrite README.md** — done (2026-07-07). Covers what Inkwell is, architecture/request-flow sketch, required env vars, Supabase SQL setup order, local dev/test/deploy, and project structure. Added `.env.example` (had to add a `!.env.example` exception to `.gitignore`'s `.env*` rule so it's actually committed).
- [x] **Add error.tsx and not-found.tsx** — done (2026-07-07). Both match the login page's amber card style (QuillIcon, serif heading, amber-700 CTA). `error.tsx` uses the Next 16.2+ `unstable_retry` prop, not the older `reset`.
- [x] **Return 404/403 on non-owner DELETE** — done (2026-07-07). `/api/articles` DELETE now looks up ownership before deleting: 404 if the article doesn't exist, 403 if it exists but isn't the caller's, 200 only on an actual delete.
- [ ] **Validate env vars at startup** — `process.env.X!` non-null assertions crash cryptically when a var is missing. Add a boot-time check with a clear message. (`.env.example` already exists as of the README rewrite above.)
- [ ] **Adopt DB migrations** — the four `supabase/*.sql` files are run-by-hand snapshots with implicit ordering; production drift is unverifiable. Move to Supabase CLI migrations or a single canonical dumped schema.

### Polish (single combined pass items)

- [x] **Design-system + accessibility pass (combined feature request)** — done (2026-07-08). `font-display` is now a real Tailwind utility (was already a valid `@theme` token, just unused as a class) — replaced all ~11 inline `style={{ fontFamily: ... }}` occurrences. Design-handoff pixel values consolidated: font sizes/line-heights/radii into new named tokens (`text-2xs`, `text-pill`, `text-badge`, `text-title-sm/md/xs`, `radius-badge-sm/lg`) in `app/globals.css`; spacing values (`gap-[13px]`, `px-[18px]`, etc.) converted to Tailwind's native fractional spacing scale (`gap-3.25`, `px-4.5`) since they're exact multiples of the 4px base unit — no bracket syntax needed. Verified pixel-for-pixel identical via computed-style inspection before/after (e.g. `gap-1.25` → 5px, `text-title-sm` → 18px/23.4px line-height, exactly matching the originals). Added `aria-pressed` to the Nod toggle and `aria-current="page"` to both nav lists (sidebar + mobile). Fixed contrast: meta/date/count text moved from `text-gray-400` (fails WCAG AA at small sizes) to `text-gray-500`.
- [x] **Uniform scroll listener** — done (2026-07-08). FeedClient's scroll handler is now rAF-throttled (a `ticking` flag + `requestAnimationFrame`, at most one DOM read + state update per frame). Also extracted `lib/url.ts`'s `getHostname()` as the single hostname-parsing helper, now used by `ArticleCard`'s `domain`, and `AuthorFeed`'s `siteLabel` + `iconSrc` (previously three separate try/catch `new URL()` blocks).
- [x] **Harden the share-page URL regex** — done (2026-07-08). Matched URLs now have trailing punctuation (`.,;:!?)]}'"`) stripped before redirecting, so "(see https://x.com/a)." correctly yields `https://x.com/a`. 3 new tests cover trailing period, parenthetical-mention, and confirm legitimate query-string punctuation isn't touched.
- [x] **Open-redirect check on auth callback `next` param** — done (2026-07-08). Added `safeNextPath()`: only same-origin values starting with a single `/` (not `//` or `/\`) are honored; anything else (bare `@evil.com`, `//evil.com`, absolute `https://evil.com`) falls back to `/feed`. This closes a real vector, not just theoretical hardening — a crafted `next=@evil.com` concatenated onto `origin` produces a URL where `evil.com` parses as the host via userinfo confusion. 6 new tests in `__tests__/auth-callback.test.ts`.
- [ ] **Structured logging** — codify the `[route-name]` log-prefix convention that fetch-og/archive-check/author-articles already follow; consider a log drain when traffic warrants.

---

## Known limitations / bugs

- [ ] **NYT / WSJ previews always go manual** — Microlink's EPROXYNEEDED is a hard block. No fix short of a paid Microlink plan or a custom proxy. The manual fallback form is the current workaround.
- [ ] **Author RSS cache is 1 hour** — set via Vercel edge cache in `author-articles/route.ts`. New articles won't appear for up to an hour after publish.
- [ ] **Nod count visible to all** — currently nod counts are public. If the group wants anonymity ("I don't want people to know what I've read"), counts would need to be hidden.

---

## Deferred / someday

- [ ] **Trending articles panel** — pull in what's popular outside the friend group (e.g. Hacker News top stories). Considered and deferred — the group didn't want noise from outside.
- [ ] **Dark mode** — globals.css has the `prefers-color-scheme` variable block stubbed but components use hardcoded `bg-white` and `text-gray-900` throughout. Would need a full pass.
- [ ] **Invite flow** — currently access is by manually adding emails in Supabase. A simple invite-by-email flow would make onboarding new friends easier.
