@AGENTS.md

# Inkwell

News article sharing app for a small friend group (~10 users).

**Stack:** Next.js 16 (App Router), Supabase (auth + postgres), Tailwind CSS, Vitest
**Deploy:** Vercel (auto-deploys on push to main)
**Auth:** Supabase magic link (email OTP), callback at /api/auth/callback

## Key files
- `app/feed/FeedClient.tsx` — main feed page (sidebar, articles grid, author feed); first page is server-rendered via page.tsx, tag filter lives in ?tag= URL param
- `lib/articles.ts` — shared article fetch + enrichment (nods, submitter names), used by both the API route and the server page
- `app/api/articles/route.ts` — GET/POST/DELETE articles
- `app/api/nods/route.ts` — toggle nod (upvote) on an article
- `app/api/fetch-og/route.ts` — Microlink metadata fetch with manual fallback
- `app/api/archive-check/route.ts` — best-effort archive.today snapshot lookup (see DECISIONS.md)
- `app/api/author-articles/route.ts` — RSS feed for Ben Thompson + Derek Thompson
- `components/ArticleCard.tsx` — article card with Nods button
- `components/SubmitArticle.tsx` — share form with preset tags + archive.is field
- `components/AuthorFeed.tsx` — author RSS section
- `app/manifest.ts` — PWA manifest with Android share_target
- `app/share/page.tsx` — share-sheet landing, redirects to /feed?share=
- `supabase/schema.sql` — articles table
- `supabase/nods-schema.sql` — nods table
- `supabase/authors-schema.sql` — authors table + seed data
- `supabase/profiles-schema.sql` — profiles table (display names) + signup trigger + backfill

See also: `DECISIONS.md` (non-obvious choices and gotchas), `BACKLOG.md` (prioritized todo).

## Conventions
- Tags stored lowercase, displayed with `capitalize` CSS
- Run tests: `npm test`
- Type check: `./node_modules/.bin/tsc --noEmit`
