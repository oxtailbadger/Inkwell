@AGENTS.md

# Inkwell

News article sharing app for a small friend group (~10 users).

**Stack:** Next.js 16 (App Router), Supabase (auth + postgres), Tailwind CSS, Vitest
**Deploy:** Vercel (auto-deploys on push to main)
**Auth:** Supabase magic link (email OTP), callback at /api/auth/callback

## Key files
- `app/feed/FeedClient.tsx` — main feed page (sidebar, articles grid, author feed); first page is server-rendered via page.tsx, tag filter lives in ?tag= URL param
- `lib/articles.ts` — shared article fetch + enrichment (cursor pagination, nod counts, submitter names, per-user saved/read/dismissed state) plus `fetchAllTags` for the tag-filter bar; used by both the API route and the server page
- `lib/validate.ts` — server-side input validation (http/https-only URLs, length caps); wire new writable fields through this
- `lib/api-errors.ts` — `dbErrorResponse` maps DB errors to safe client messages; use for any route touching the database
- `lib/url.ts` — `getHostname()`, the single shared URL-hostname parser (ArticleCard, AuthorFeed)
- `lib/rate-limit.ts` / `lib/server-cache.ts` — in-memory per-user rate limiting + TTL caches for fetch-og/archive-check (per-instance by design, see DECISIONS.md)
- `lib/paywall.ts` — RSS paywall heuristics (extracted from author-articles route for testability)
- `lib/logger.ts` — `logInfo`/`logWarn`/`logError`, enforces the `[route-name]` log-prefix convention; route through this instead of calling `console.*` directly
- `lib/useTheme.ts` — shared `{ theme, setTheme }` hook, used by `ThemeToggle` and the profile page's theme selector (see DECISIONS.md)
- `instrumentation.ts` — validates required env vars at server boot (Next's `register()` hook), fails fast with a clear message instead of a cryptic `process.env.X!` crash
- `.github/workflows/ci.yml` — typecheck + tests + build on push/PR
- `app/api/articles/route.ts` — GET (paginated, `?cursor=&limit=`) /POST/DELETE articles
- `app/api/nods/route.ts` — toggle nod (upvote) on an article
- `app/api/article-state/route.ts` — PATCH per-user save/read/dismiss state, action-discriminated body (see DECISIONS.md)
- `app/api/profile/route.ts` — PATCH the caller's `display_name`
- `app/api/feedback/route.ts` — POST user feedback (insert-only; read via Supabase dashboard, no in-app read — see DECISIONS.md)
- `app/api/fetch-og/route.ts` — Microlink metadata fetch with manual fallback
- `app/api/archive-check/route.ts` — best-effort archive.today snapshot lookup (see DECISIONS.md)
- `app/api/author-articles/route.ts` — RSS feeds for the curated authors (driven by the `authors` table, no code change to add one)
- `components/ArticleCard.tsx` — article card with Nods button + Save/Read/Dismiss kebab menu
- `components/SubmitArticle.tsx` — share form with preset tags + archive.is field
- `components/AuthorFeed.tsx` — author RSS section
- `components/ThemeToggle.tsx` — light/dark toggle (header), via `lib/useTheme.ts`
- `components/Toast.tsx` — dismiss-with-undo toast stack, state owned by FeedClient
- `app/profile/page.tsx` / `ProfileClient.tsx` — display name (`profiles.display_name`), theme selector, FAQ accordion (native `<details>`, no library — see DECISIONS.md), and a send-feedback textarea (POSTs to `/api/feedback`); header avatar in `FeedClient.tsx` links here
- `app/manifest.ts` — PWA manifest with Android share_target
- `app/share/page.tsx` — share-sheet landing, redirects to /feed?share=
- `app/error.tsx` / `app/not-found.tsx` — themed error/404 pages, Broadsheet palette
- `proxy.ts` — session refresh + auth redirect (Next 16's middleware.ts renamed to proxy.ts)
- `supabase/schema.sql` — articles table
- `supabase/nods-schema.sql` — nods table
- `supabase/nod-counts-view.sql` — `article_nod_counts` view (pre-aggregated counts, see DECISIONS.md)
- `supabase/article-state-schema.sql` — `article_state` table (per-user saved/read/dismissed, private RLS)
- `supabase/authors-schema.sql` — authors table + seed data
- `supabase/profiles-schema.sql` — profiles table (display names) + signup trigger + backfill
- `supabase/feedback-schema.sql` — feedback table (insert-only RLS, no select policy — see DECISIONS.md)

See also: `DECISIONS.md` (non-obvious choices and gotchas), `BACKLOG.md` (prioritized todo).

## Conventions
- Tags stored lowercase, displayed with `capitalize` CSS
- "Broadsheet" design system (2026-07-08): editorial/newsroom palette (paper/ink/accent), no shadows, hairline borders. Never hardcode a Tailwind gray/white/amber/red class in the authenticated app shell — use the semantic `bg-paper`/`text-ink`/`border-card-border`/etc. utilities (backed by CSS variables in `app/globals.css`) so dark mode keeps working; destructive/error styling uses `text-danger`/`bg-danger-tint`/`border-danger-border`. See DECISIONS.md before adding new tokens.
- Font roles: Work Sans (`--font-sans`, default) for titles/body/buttons; Cormorant Garamond (`font-display`) *only* for small-caps meta/eyebrow text (site names, section labels, tags, dates) — this inverted from the app's earlier font pairing, see DECISIONS.md.
- Dark mode is explicit (`data-theme` attribute + localStorage via `ThemeToggle.tsx`), not `prefers-color-scheme`.
- `GET /api/articles` is cursor-paginated (`{ articles, nextCursor }`), not a raw array — see DECISIONS.md before changing the query shape in `fetchEnrichedArticles`. Dismissed articles are excluded server-side by default, not client-filtered. `?saved=1`/`?read=1`/`?dismissed=1` each filter to that state, AND together and with `?tag=` (independent toggles, not mutually exclusive) — `dismissedOnly` is the one asymmetric case, flipping the default exclusion into an inclusion filter instead of adding to it. See DECISIONS.md before touching this.
- Colors that must stay constant regardless of theme (e.g. `components/Toast.tsx`) use hardcoded hex, not `bg-ink`/`text-paper` — those tokens flip in dark mode, a fixed-dark toast needs literal values instead. See DECISIONS.md.
- Tests are logic-level, not DOM-render: flat files in `__tests__/` (not colocated), API routes are called directly with a constructed `NextRequest`, page.tsx server components are called directly as async functions (mocking `next/navigation`'s `redirect` to throw, matching prod control flow). No `@testing-library/react`/DOM rendering anywhere — see DECISIONS.md before introducing one.
- Supabase is mocked per-test with hand-built chainable objects matching the exact query shape the code under test issues (`vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))`, then `vi.mocked(createClient).mockResolvedValue(fakeSupabase)` per test) — not a generic Supabase test client. `__tests__/nods-api.test.ts` or `__tests__/article-state-api.test.ts` are the clearest examples to copy from.
- Run tests: `npm test`
- Type check: `./node_modules/.bin/tsc --noEmit`
