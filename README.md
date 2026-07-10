# Inkwell

A news-sharing app for a small group of friends. Paste a link, add a topic tag, and it shows up in the shared feed — friends can "Nod" articles they liked, and a few curated authors' latest free posts appear alongside the group's own shares.

Beyond the shared feed, each person also gets their own private layer: Save articles for later, mark them read, or dismiss ones that aren't for them (with a Profile page for display name and light/dark preference).

Live app: https://inkwell-reads.vercel.app

## How it's built

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS 4 — no `tailwind.config.js`, theming is CSS variables
- **Backend:** Supabase — Postgres database, magic-link/OTP auth, row-level security
- **Deploy:** Vercel, auto-deploys on push to `main`
- **Tests:** Vitest, run via `npm test` — logic-level, no DOM-rendering library (see [DECISIONS.md](DECISIONS.md))

### Request flow

- `proxy.ts` (Next's middleware convention) refreshes the Supabase session cookie on every request; each protected page does its own `redirect("/login")` check. `instrumentation.ts` validates required env vars once at boot, failing fast with a clear error instead of a cryptic crash mid-request.
- `app/feed/page.tsx` fetches the first page of articles, the tag list, and the user's profile server-side, then hands off to `FeedClient.tsx` for interactivity — filtering (by tag, and by Saved/Read/Dismissed), pagination, nodding, submitting.
- `app/profile/page.tsx` covers account-level settings: display name, light/dark preference, and a short FAQ. It's linked from an avatar in the feed header.
- API routes under `app/api/*` handle the mutations behind those pages: `articles` (cursor-paginated GET, plus POST/DELETE), `nods` (public upvote toggle), `article-state` (private save/read/dismiss, one action-discriminated `PATCH`), and `profile` (display name).
- Two more routes handle outbound integrations: `fetch-og` pulls title/description/image for a pasted URL via the Microlink API, and `archive-check` does a best-effort archive.today snapshot lookup. `author-articles` polls RSS feeds for a small set of curated authors (configured in the `authors` table, not in code) and filters out paywalled posts by heuristic.

See **[DECISIONS.md](DECISIONS.md)** for the reasoning behind specific choices — why Microlink instead of a scraper library, why there's no join on `auth.users`, how the iOS share flow works, and more. See **[BACKLOG.md](BACKLOG.md)** for what's planned, and **[project_history.md](project_history.md)** / **[RELEASE_NOTES.md](RELEASE_NOTES.md)** for what's shipped and when.

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

Each file also contains commented-out `alter table` statements for columns added after the table was first created — check the top of each file if you're setting up a project that already has some of these tables.

**Don't skip steps 3 and 4.** `lib/articles.ts` queries `article_nod_counts` and `article_state` on every feed request, not just when their features are used — without them, the feed fails to load at all (see [DECISIONS.md](DECISIONS.md)).

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
  feed/             # main feed — server page + client component
  profile/          # display name, theme setting, FAQ
  login/            # magic-link + OTP sign-in
  share/            # Web Share Target landing page (PWA)
  error.tsx         # themed error page
  not-found.tsx     # themed 404 page
  manifest.ts       # PWA manifest
  api/              # route handlers — see "Request flow" above
components/         # ArticleCard, AuthorFeed, SubmitArticle, ThemeToggle, Toast, ...
lib/
  supabase/         # Supabase client factories (browser, server, proxy)
  articles.ts       # article fetch/pagination + enrichment
  useTheme.ts       # shared light/dark state (ThemeToggle + Profile)
  validate.ts       # server-side input validation
  api-errors.ts     # sanitized error responses for API routes
  logger.ts         # [route-name]-prefixed server logging
  rate-limit.ts     # in-memory rate limiting (see DECISIONS.md)
  server-cache.ts   # in-memory TTL cache (see DECISIONS.md)
  paywall.ts        # RSS paywall-detection heuristics
supabase/           # SQL schema files, run manually in the Supabase SQL editor
instrumentation.ts  # boot-time env var validation
__tests__/          # Vitest test suites (logic-level, see DECISIONS.md)
```
