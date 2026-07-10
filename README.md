# Inkwell

A news-sharing app for a small group of friends. Paste a link, add a topic tag, and it shows up in the shared feed — friends can "Nod" articles they liked, and a few curated authors' latest free posts appear alongside the group's own shares. Each person can also Save, mark Read, or Dismiss articles privately (with dedicated filter views for each, plus a way to restore anything dismissed), and set a display name and light/dark preference from a Profile page.

Live app: https://inkwell-reads.vercel.app

## How it's built

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4 (CSS-variable design tokens, no `tailwind.config.js` — see [DECISIONS.md](DECISIONS.md))
- **Backend:** Supabase — Postgres database, magic-link/OTP auth, row-level security
- **Deploy:** Vercel, auto-deploys on push to `main`
- **Tests:** Vitest, run via `npm test` — logic-level (API routes and server components called directly, hand-built Supabase mocks), no DOM-rendering library; see [DECISIONS.md](DECISIONS.md) before adding one

### Request flow

- `proxy.ts` (Next's middleware convention) refreshes the Supabase session cookie on every request; each protected page does its own `redirect("/login")` check server-side.
- `instrumentation.ts` validates required env vars once at server boot and fails fast with a clear error if one's missing, instead of a cryptic crash mid-request.
- `app/feed/page.tsx` is a server component: it fetches the first page of articles, the full tag list, and the signed-in user's `profiles` row server-side (via `lib/articles.ts`) so the feed renders with content immediately, then hands off to the client component `FeedClient.tsx` for interactivity (tag/Saved/Read/Dismissed filtering, pagination via "Load more", nodding, submitting).
- API routes under `app/api/*` handle mutations: `articles` (cursor-paginated GET, POST, DELETE), `nods` (public upvote toggle), `article-state` (private per-user save/read/dismiss, one action-discriminated `PATCH`), `profile` (display name), plus two outbound integrations — `fetch-og` (pulls title/description/image for a pasted URL via the Microlink API) and `archive-check` (best-effort archive.today snapshot lookup).
- `app/api/author-articles/route.ts` polls RSS feeds for a small set of curated authors (configured in the `authors` table, not in code) and filters out paywalled posts by heuristic.
- `app/profile/page.tsx` lets a signed-in user change their display name, set light/dark mode as an explicit preference, and read a short FAQ — linked from an avatar in the feed header.

For the reasoning behind specific decisions — why Microlink instead of a scraper library, why there's no join on `auth.users`, how the iOS PWA share flow works, why some fields have server-side validation and others don't, how the per-user Save/Read/Dismiss state composes with pagination — see **[DECISIONS.md](DECISIONS.md)**. For what's built vs. planned, see **[BACKLOG.md](BACKLOG.md)**. For what shipped when, see **[project_history.md](project_history.md)** and **[RELEASE_NOTES.md](RELEASE_NOTES.md)**.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Set up a Supabase project

Create a project at [supabase.com](https://supabase.com), then run the SQL files in `supabase/` **in this order** in the Supabase SQL editor (later files reference tables created by earlier ones):

1. `schema.sql` — the `articles` table
2. `nods-schema.sql` — the `nods` table (references `articles`)
3. `nod-counts-view.sql` — the `article_nod_counts` view (pre-aggregated counts, references `nods`)
4. `article-state-schema.sql` — the `article_state` table: private per-user saved/read/dismissed flags (references `articles`)
5. `profiles-schema.sql` — the `profiles` table (display names) + a trigger that creates a profile on signup
6. `authors-schema.sql` — the `authors` table + seed data for the curated-authors feed

Each file also contains commented-out `alter table` statements for columns added after the table was first created — check the top of each file if you're setting up a project that already has some of these tables. Note: `lib/articles.ts` queries `article_nod_counts` and `article_state` unconditionally on every feed request — skipping steps 3 or 4 breaks the feed entirely, not just the features that depend on them (see [DECISIONS.md](DECISIONS.md)).

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
  profile/        # display name, theme setting, FAQ (server page + client component)
  login/          # magic-link + OTP sign-in
  share/          # Web Share Target landing page (PWA)
  error.tsx, not-found.tsx  # themed error/404 pages
  api/            # route handlers: articles, nods, article-state, profile,
                  # fetch-og, archive-check, author-articles, auth callback
  manifest.ts     # PWA manifest
components/       # UI components (ArticleCard, AuthorFeed, SubmitArticle,
                  # ThemeToggle, Toast, QuillIcon, ...)
lib/
  supabase/       # Supabase client factories (browser, server, proxy)
  articles.ts     # shared article fetch/pagination + enrichment logic
  useTheme.ts     # shared light/dark state, used by ThemeToggle + Profile
  validate.ts     # server-side input validation
  api-errors.ts   # sanitized error responses for API routes
  logger.ts       # [route-name]-prefixed server logging
  rate-limit.ts, server-cache.ts  # in-memory, per-instance (see DECISIONS.md)
  paywall.ts      # RSS paywall-detection heuristics
supabase/         # SQL schema files, run manually in the Supabase SQL editor
instrumentation.ts  # boot-time env var validation
__tests__/        # Vitest test suites (logic-level, see DECISIONS.md)
```
