@AGENTS.md

# Inkwell

News article sharing app for a small friend group (~10 users).

**Stack:** Next.js 16 (App Router), Supabase (auth + postgres), Tailwind CSS, Vitest
**Deploy:** Vercel (auto-deploys on push to main)
**Auth:** Supabase magic link (email OTP), callback at /api/auth/callback

## Key files
- `app/feed/FeedClient.tsx` — main feed page (sidebar, articles grid, author feed)
- `app/api/articles/route.ts` — GET/POST/DELETE articles, includes nod counts
- `app/api/nods/route.ts` — toggle nod (upvote) on an article
- `app/api/fetch-og/route.ts` — Microlink metadata fetch with manual fallback
- `app/api/author-articles/route.ts` — RSS feed for Ben Thompson + Derek Thompson
- `components/ArticleCard.tsx` — article card with Nods button
- `components/SubmitArticle.tsx` — share form with preset tags + archive.is field
- `components/AuthorFeed.tsx` — author RSS section
- `supabase/schema.sql` — articles table
- `supabase/nods-schema.sql` — nods table
- `supabase/authors-schema.sql` — authors table + seed data

## Conventions
- Tags stored lowercase, displayed with `capitalize` CSS
- Run tests: `npm test`
- Type check: `./node_modules/.bin/tsc --noEmit`
