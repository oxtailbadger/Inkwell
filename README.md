# Inkwell

A news-sharing app for a small group of friends. Paste a link, add a topic tag, and it shows up in the shared feed — friends can "Nod" articles they liked, and a few curated authors' latest free posts appear alongside the group's own shares.

Live app: https://inkwell-reads.vercel.app

## How it's built

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4
- **Backend:** Supabase — Postgres database, magic-link/OTP auth, row-level security
- **Deploy:** Vercel, auto-deploys on push to `main`
- **Tests:** Vitest, run via `npm test`

### Request flow

- `proxy.ts` (Next's middleware convention) refreshes the Supabase session cookie on every request and redirects unauthenticated visitors to `/login`.
- `app/feed/page.tsx` is a server component: it fetches the first page of articles server-side (via `lib/articles.ts`) so the feed renders with content immediately, then hands off to the client component `FeedClient.tsx` for interactivity (tag filtering, nodding, submitting).
- API routes under `app/api/*` handle mutations (`articles`, `nods`) and two outbound integrations: `fetch-og` (pulls title/description/image for a pasted URL via the Microlink API) and `archive-check` (best-effort archive.today snapshot lookup).
- `app/api/author-articles/route.ts` polls RSS feeds for a small set of curated authors (configured in the `authors` table, not in code) and filters out paywalled posts by heuristic.

For the reasoning behind specific decisions — why Microlink instead of a scraper library, why there's no join on `auth.users`, how the iOS PWA share flow works, why some fields have server-side validation and others don't — see **[DECISIONS.md](DECISIONS.md)**. For what's built vs. planned, see **[BACKLOG.md](BACKLOG.md)**.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up a Supabase project

Create a project at [supabase.com](https://supabase.com), then run the SQL files in `supabase/` **in this order** in the Supabase SQL editor (later files reference tables created by earlier ones):

1. `schema.sql` — the `articles` table
2. `nods-schema.sql` — the `nods` table (references `articles`)
3. `profiles-schema.sql` — the `profiles` table + a trigger that creates a profile on signup
4. `authors-schema.sql` — the `authors` table + seed data for the curated-authors feed

Each file also contains commented-out `alter table` statements for columns added after the table was first created — check the top of each file if you're setting up a project that already has some of these tables.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project's URL and anon key (found in Supabase under Project Settings → API):

```bash
cp .env.example .env.local
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`; Supabase's built-in email service sends the sign-in link and code (see note below on production email).

### Running tests

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Type check: `./node_modules/.bin/tsc --noEmit`

## Deploying

The app auto-deploys to Vercel on every push to `main`. To set up a new deployment:

1. Import the repo into Vercel.
2. Add the same two environment variables from `.env.local` in the Vercel project settings.
3. In Supabase, add your Vercel deployment URL to **Authentication → URL Configuration** (Site URL and Redirect URLs) so magic links redirect correctly.

**Before inviting anyone beyond a small trusted group**, read the "Path to public launch" section of [BACKLOG.md](BACKLOG.md) — notably, Supabase's built-in email sender is rate-limited and not intended for production traffic, and every authenticated user currently has read access to all data (fine for a closed friend group, not fine for open signup).

## Project structure

```
app/
  feed/           # main feed (server page + client component)
  login/          # magic-link + OTP sign-in
  share/          # Web Share Target landing page (PWA)
  api/            # route handlers (articles, nods, fetch-og, archive-check, author-articles, auth callback)
  manifest.ts     # PWA manifest
components/       # UI components (ArticleCard, AuthorFeed, SubmitArticle, ...)
lib/
  supabase/       # Supabase client factories (browser, server, proxy)
  articles.ts     # shared article fetch + enrichment logic
  validate.ts     # server-side input validation
  api-errors.ts   # sanitized error responses for API routes
supabase/         # SQL schema files, run manually in the Supabase SQL editor
__tests__/        # Vitest test suites
```
