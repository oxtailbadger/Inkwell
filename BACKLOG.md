# Inkwell — Backlog

Items are roughly ordered by priority within each section. Move things between sections freely as priorities shift.

---

## Beta polish (small, high impact)

- [ ] **Mobile sidebar** — the `<aside>` is `hidden lg:block`, so mobile users have no way to jump to Authors. A bottom nav bar or a drawer would work.
- [ ] **Show who shared** — article cards say "Friend" for everyone. Consider showing first name or initials if users add a display name.
- [ ] **Tag filter persistence** — active tag filter resets on page reload. Could store in URL param (`?tag=politics`) so links are shareable.
- [ ] **Empty tag state** — if a tag filter returns zero articles, there's no message explaining why.

---

## Features

- [ ] **Add more curated authors** — the `authors` table in Supabase drives the feed. Easy to add new RSS feeds without a code deploy. Candidates: Ezra Klein, Matt Levine (Bloomberg), The Economist briefing.
- [ ] **Article comments / reactions** — a lightweight text reply thread per article so friends can discuss without a group chat.
- [ ] **Weekly digest email** — a cron-triggered email (Resend or Postmark) with the top-nodded articles from the past 7 days.
- [ ] **Search** — basic title/description search across saved articles.
- [ ] **Archive.is auto-suggest** — after a URL is submitted, auto-fetch and pre-fill the archive link so users don't have to do it manually.

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
