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

- [ ] **Validate stored URLs server-side** — POST /api/articles accepts `url`, `archive_url`, `image_url` as arbitrary strings, later rendered as hrefs/image src (stored-XSS vector via `javascript:` URLs). Parse with `new URL`, require http/https, add length caps on title/description and count/length caps on tags.
- [ ] **Client-friendly error messages** — every API route returns raw Supabase/Postgres `error.message` to the client (leaks schema details). Map to generic messages client-side of the boundary; log the real error server-side.
- [ ] **Rate limiting + fetch-og caching** — no route has rate limits. Priority: `/api/fetch-og` (burns Microlink quota; also cache successful lookups by URL — every re-preview of the same URL re-hits Microlink) and `/api/archive-check` (archive.ph already 429s; don't get the IP range blocked). Vercel KV / Upstash per-user limits.
- [ ] **CI + broader test coverage** — no `.github/workflows`; tests never run before deploy. Add a GitHub Actions workflow (typecheck + vitest on PR). Then extend coverage to the untested surfaces: nods toggle, fetch-og (the Microlink 200-on-fail semantics), author-articles paywall heuristics (most fragile logic in the app, zero tests), profiles enrichment. Consider a small Playwright smoke suite against a seeded preview deploy — the two worst historical bugs were integration-level and invisible to unit mocks.

### Medium priority

- [ ] **Rename middleware.ts → proxy.ts** — Next 16 deprecated the middleware convention (warns on every dev boot). While in there, comment every exclusion in the matcher regex; it has grown organically.
- [ ] **Rewrite README.md** — still stock create-next-app boilerplate. Needs: what Inkwell is, architecture sketch, required env vars (also add `.env.example`), Supabase setup order for the four SQL files, local dev / test / deploy instructions. CLAUDE.md/DECISIONS.md/BACKLOG.md cover agents; README is the human entry point.
- [ ] **Add error.tsx and not-found.tsx** — no App Router error or 404 boundaries exist; RSC failures show Next's default screen. Style both to match the amber theme.
- [ ] **Return 404/403 on non-owner DELETE** — `/api/articles` DELETE returns `{ success: true }` even when the ownership `.eq()` matched zero rows; the API lies and clients desync.
- [ ] **Validate env vars at startup** — `process.env.X!` non-null assertions crash cryptically when a var is missing. Add a boot-time check with clear messages, plus `.env.example`.
- [ ] **Adopt DB migrations** — the four `supabase/*.sql` files are run-by-hand snapshots with implicit ordering; production drift is unverifiable. Move to Supabase CLI migrations or a single canonical dumped schema.

### Polish (single combined pass items)

- [ ] **Design-system + accessibility pass (combined feature request)** — one pass covering: replace the ~15 repeated `style={{ fontFamily: "var(--font-display)" }}` inline styles with a Tailwind `font-display` utility via `@theme`; consolidate design-handoff arbitrary pixel values (`text-[11.5px]`, `gap-[13px]`, `px-[18px]`) into theme tokens; add `aria-pressed` to the Nod toggle and `aria-current` to nav items; fix the ~2.8:1 contrast failure on 11px `text-gray-400` meta text.
- [ ] **Uniform scroll listener** — throttle the FeedClient scroll handler (rAF), and while touching shared client utils, dedupe the domain-parsing logic that now exists in slightly different forms in both `AuthorFeed` (`siteLabel`) and `ArticleCard` (`domain`).
- [ ] **Harden the share-page URL regex** — `https?:\/\/\S+` captures trailing punctuation from prose shares ("(see https://x.com/a)." keeps the paren/period).
- [ ] **Open-redirect check on auth callback `next` param** — currently same-origin path interpolation, but a `next=//evil.com` guard is cheap insurance.
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
