@AGENTS.md

# Inkwell

News article sharing app for a small friend group (~10 users).

**Stack:** Next.js 16 (App Router), Supabase (auth + postgres), Tailwind CSS, Vitest
**Deploy:** Vercel (auto-deploys on push to main)
**Auth:** Supabase magic link (email OTP), callback at /api/auth/callback

## Key files
- `app/feed/FeedClient.tsx` — main feed page (sidebar, articles grid, author feed); first page is server-rendered via page.tsx, tag filter lives in ?tag= URL param
- `lib/articles.ts` — shared article fetch + enrichment (nods, submitter names), used by both the API route and the server page
- `lib/validate.ts` — server-side input validation (http/https-only URLs, length caps); wire new writable fields through this
- `lib/api-errors.ts` — `dbErrorResponse` maps DB errors to safe client messages; use for any route touching the database
- `lib/url.ts` — `getHostname()`, the single shared URL-hostname parser (ArticleCard, AuthorFeed)
- `lib/rate-limit.ts` / `lib/server-cache.ts` — in-memory per-user rate limiting + TTL caches for fetch-og/archive-check (per-instance by design, see DECISIONS.md)
- `lib/paywall.ts` — RSS paywall heuristics (extracted from author-articles route for testability)
- `lib/logger.ts` — `logInfo`/`logWarn`/`logError`, enforces the `[route-name]` log-prefix convention; route through this instead of calling `console.*` directly
- `instrumentation.ts` — validates required env vars at server boot (Next's `register()` hook), fails fast with a clear message instead of a cryptic `process.env.X!` crash
- `.github/workflows/ci.yml` — typecheck + tests + build on push/PR
- `app/api/articles/route.ts` — GET/POST/DELETE articles
- `app/api/nods/route.ts` — toggle nod (upvote) on an article
- `app/api/fetch-og/route.ts` — Microlink metadata fetch with manual fallback
- `app/api/archive-check/route.ts` — best-effort archive.today snapshot lookup (see DECISIONS.md)
- `app/api/author-articles/route.ts` — RSS feed for Ben Thompson + Derek Thompson
- `components/ArticleCard.tsx` — article card with Nods button
- `components/SubmitArticle.tsx` — share form with preset tags + archive.is field
- `components/AuthorFeed.tsx` — author RSS section
- `components/ThemeToggle.tsx` — light/dark toggle, writes `data-theme` + localStorage
- `app/manifest.ts` — PWA manifest with Android share_target
- `app/share/page.tsx` — share-sheet landing, redirects to /feed?share=
- `app/error.tsx` / `app/not-found.tsx` — themed error/404 pages, Broadsheet palette
- `proxy.ts` — session refresh + auth redirect (Next 16's middleware.ts renamed to proxy.ts)
- `supabase/schema.sql` — articles table
- `supabase/nods-schema.sql` — nods table
- `supabase/authors-schema.sql` — authors table + seed data
- `supabase/profiles-schema.sql` — profiles table (display names) + signup trigger + backfill

See also: `DECISIONS.md` (non-obvious choices and gotchas), `BACKLOG.md` (prioritized todo).

## Conventions
- Tags stored lowercase, displayed with `capitalize` CSS
- "Broadsheet" design system (2026-07-08): editorial/newsroom palette (paper/ink/accent), no shadows, hairline borders. Never hardcode a Tailwind gray/white/amber class in the authenticated app shell — use the semantic `bg-paper`/`text-ink`/`border-card-border`/etc. utilities (backed by CSS variables in `app/globals.css`) so dark mode keeps working. See DECISIONS.md before adding new tokens.
- Font roles: Work Sans (`--font-sans`, default) for titles/body/buttons; Cormorant Garamond (`font-display`) *only* for small-caps meta/eyebrow text (site names, section labels, tags, dates) — this inverted from the app's earlier font pairing, see DECISIONS.md.
- Dark mode is explicit (`data-theme` attribute + localStorage via `ThemeToggle.tsx`), not `prefers-color-scheme`.
- Run tests: `npm test`
- Type check: `./node_modules/.bin/tsc --noEmit`
