# Inkwell — Backlog

Items are roughly ordered by priority within each section. Move things between sections freely as priorities shift.

---

## Features

- [ ] **Add more curated authors** — the `authors` table in Supabase drives the feed. Easy to add new RSS feeds without a code deploy. Candidates: Ezra Klein, Matt Levine (Bloomberg), The Economist briefing.
- [ ] **Article comments / reactions** — a lightweight text reply thread per article so friends can discuss without a group chat. `article_state` (per-user, per-article, RLS scoped to the owning user — see DECISIONS.md) is a ready-made template for a `comments` table's RLS, now that it exists.
- [ ] **Weekly digest email** — a cron-triggered email (Resend or Postmark) with the top-nodded articles from the past 7 days.
- [ ] **Full-text search** — search across everything ever shared, title + description (article body if Reader view lands). Postgres `tsvector`/`tsquery` with a GIN index makes this nearly free on Supabase; the group's collective memory ("what was that shipping piece from last year?").
- [ ] **Pull quotes** — let the sharer attach a highlighted sentence when submitting ("this is the paragraph that made me send this"). New nullable `pull_quote` column on articles + a textarea in SubmitArticle + styled blockquote on the card. Cheap to build, answers "why should I read this?"
- [ ] **Bookmarklet or browser extension** — desktop capture friction. Start with a bookmarklet (an afternoon: a `javascript:` link that opens `/share?url=` + current page URL — reuses the Web Share Target landing route as-is); only graduate to a Chrome extension if the group wants context menus or one-click submit.
- [ ] **Reader view** — parse article text server-side (Mozilla Readability) and offer a clean in-app reading page. Highest-effort item here and legally gray for paywalled content; pairs with the archive.is habit. Only build if testers ask for it.
- [ ] **Update user email** — let a signed-in user change their login email. Supabase supports `auth.updateUser({ email })` with a confirmation link to the new address; needs a small settings page/modal plus handling for the confirmation state. Note: display names derive from the original email prefix at signup, so decide whether an email change should refresh `profiles.display_name`.

---

## Path to public launch

Findings from the full acquisition-style code review (2026-07-07, full details in that session's review). These are the changes needed to take Inkwell from a trusted-friends beta to a public-scale launch. Ordered by priority within each tier.

### Launch blockers — do before any public exposure

- [ ] **Enforce the access model in code, not dashboard config** — every RLS read policy is `using (true)` for any authenticated user, so privacy still depends partly on the unversioned "allow new signups" Supabase dashboard toggle. `signInWithOtp` now passes `shouldCreateUser: false` (2026-07-09, see DECISIONS.md), which closes the client-side half; the remaining fix is an allowlist table checked by RLS, or the invite flow (see Deferred).
- [ ] **Custom SMTP before launch** — auth emails ride Supabase's built-in dev-only sender (a few emails/hour). Set up Resend or Postmark with SPF/DKIM on a real domain; also unblocks the weekly digest feature.

### Medium priority

- [ ] **Adopt DB migrations** — the `supabase/*.sql` files (six as of 2026-07-10: `schema`, `nods-schema`, `nod-counts-view`, `article-state-schema`, `authors-schema`, `profiles-schema`) are run-by-hand snapshots with implicit ordering; production drift is unverifiable, and the count keeps growing every feature. Move to Supabase CLI migrations or a single canonical dumped schema.

---

## Known limitations / bugs

- [ ] **NYT / WSJ previews always go manual** — Microlink's EPROXYNEEDED is a hard block. No fix short of a paid Microlink plan or a custom proxy. The manual fallback form is the current workaround.
- [ ] **Author RSS cache is 1 hour** — set via Vercel edge cache in `author-articles/route.ts`. New articles won't appear for up to an hour after publish.
- [ ] **Nod count visible to all** — currently nod counts are public. If the group wants anonymity ("I don't want people to know what I've read"), counts would need to be hidden.

---

## Deferred / someday

- [ ] **Trending articles panel** — pull in what's popular outside the friend group (e.g. Hacker News top stories). Considered and deferred — the group didn't want noise from outside.
- [ ] **Invite flow** — currently access is by manually adding emails in Supabase. A simple invite-by-email flow would make onboarding new friends easier.
- [ ] **Recolor QuillIcon for the new palette** — the quill logo's hardcoded amber/gold hex fills (`components/QuillIcon.tsx`) don't participate in the paper/ink/accent token system and stay static across light/dark mode. Left as-is deliberately (a warm quill reads fine as a standalone mark), but worth reconsidering if it looks dated next to the new editorial palette.
- [ ] **Move saved/read/dismissed filtering into a DB-side anti-join** — `fetchEnrichedArticles`'s `fetchStateIds` helper pre-fetches the caller's full ID list for whichever of dismissed/saved/read is active (dismissed always, for the default exclusion) on every feed request and ships it back as a URL filter. Unbounded over time; fine at friend-group scale (see DECISIONS.md), but a public launch should replace these lookups with a view or RPC that joins `article_state` in Postgres.
