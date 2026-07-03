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

## Known limitations / bugs

- [ ] **NYT / WSJ previews always go manual** — Microlink's EPROXYNEEDED is a hard block. No fix short of a paid Microlink plan or a custom proxy. The manual fallback form is the current workaround.
- [ ] **Author RSS cache is 1 hour** — set via Vercel edge cache in `author-articles/route.ts`. New articles won't appear for up to an hour after publish.
- [ ] **Nod count visible to all** — currently nod counts are public. If the group wants anonymity ("I don't want people to know what I've read"), counts would need to be hidden.

---

## Deferred / someday

- [ ] **Trending articles panel** — pull in what's popular outside the friend group (e.g. Hacker News top stories). Considered and deferred — the group didn't want noise from outside.
- [ ] **Dark mode** — globals.css has the `prefers-color-scheme` variable block stubbed but components use hardcoded `bg-white` and `text-gray-900` throughout. Would need a full pass.
- [ ] **Invite flow** — currently access is by manually adding emails in Supabase. A simple invite-by-email flow would make onboarding new friends easier.
