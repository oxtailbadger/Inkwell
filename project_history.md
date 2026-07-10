# Inkwell — Project History

A running record of work sessions on Inkwell, kept for continuity across sessions and models. Update this after every few sessions rather than every commit — it's a narrative log, not a changelog (see `RELEASE_NOTES.md` for user-facing changes and `git log` for the full commit history).

---

## As of July 10, 2026

### Timeline

**Started:** June 24, 2026 (initial commit + v0 build)
**Most recent commit:** July 10, 2026, 10:50 AM
**Span:** ~16 days across 13 working sessions

| Session | Date | Time span | Commits | Focus |
|---|---|---|---|---|
| 1 | Jun 24 | 20:56–22:15 (1h19m) | 4 | Initial build — Pocket-style article sharing, quill icon, tagline |
| 2 | Jun 29 | 21:24–22:38 (1h14m) | 9 | Microlink swap, antibot fallback, author RSS feed, sidebar nav, Nods |
| 3 | Jul 2 | 21:31–22:32 (1h01m) | 8 | Mobile nav, display names, PWA share target, archive.today auto-suggest |
| 4 | Jul 4 | 09:54 | 1 | Share-page landing tests |
| 5 | Jul 6 | 22:29–22:43 (14m) | 2 | OTP code login, Phil Gaimon author |
| 6 | Jul 7 (AM) | 10:46–12:28 (1h42m) | 7 | Authors/article card redesign, amber theme, public-launch code review |
| 7 | Jul 7 (PM) | 15:24–16:50 (1h26m) | 5 | Favicons, validation/error sanitization, README/proxy/error pages, design-system + a11y pass, login page |
| 8 | Jul 7 (eve.) | 20:00–20:23 (23m) | 4 | Rate limiting + outbound caching, CI workflow, test coverage 52→92, open-redirect fix |
| 9 | Jul 7 (late) | 22:19–22:29 (10m) | 2 | "Broadsheet" redesign (green editorial palette + real dark mode), login/error/404 ported to match |
| 10 | Jul 9 (AM) | 14:06–14:21 (15m) | 2 | Section-heading/tagline polish, three launch-readiness fixes (`shouldCreateUser:false`, env var validation, structured logging) |
| 11 | Jul 9 (PM) | 16:22–17:12 (50m) | 4 | Pagination + DB-side nod counts, Save/Read/Dismiss, "Saved" filter view, backlog cleanup |
| 12 | Jul 9 (eve.) | 20:15–21:00 (45m) | 2 | Senior-engineer self-review of the two prior sessions (5 necessary fixes), Profile page (display name, theme setting, FAQ) |
| 13 | Jul 10 | 10:50 | 1 | Read/Dismissed filter views, kebab "Restore" action, sun/moon pill theme switch |

### The numbers

- **50 commits total**, all pushed to `main` (pushes happen immediately after each commit in this workflow, so pushes ≈ commits — git doesn't log push events separately, so this is inferred, not counted directly)
- **~9.3 hours** of active coding time, measured as first-commit-to-last-commit span per session. This is a **lower bound** — it excludes research, design review, browser testing, and planning conversation before the first commit or after the last one in a session (sessions 4 and 13, single commits each, contribute ~0 by this measure despite real work happening around them)
- **137 tests** in the current suite (0 at project start, 52 as of the first mid-project check-in, 92 after session 8's coverage push)
- **6 Claude Design handoffs** implemented (authors section, article cards, two amber-theme passes, the Broadsheet green-palette redesign, and the Save/Read/Dismiss card interaction spec)
- **2 structured reviews**: 1 acquisition-style code review (session 6, → the 15-item public-launch backlog) and 1 senior-engineer self-review of two prior sessions' commits (session 12, → 5 necessary fixes: optimistic-UI actions that didn't actually revert on server failure, a DB failure rendering as an empty state instead of an error, an unvalidated pagination-cursor injection path, a state-upsert `updated_at` that never updated, and a pagination regression in the tag-filter bar)

### What shipped

Went from a bare Next.js starter to a themed, tested, documented PWA with a real feature set:

- **Core product:** magic-link + OTP auth, Supabase-backed article sharing with Nods (upvotes), a curated-author RSS feed with paywall filtering, per-user Save/Read/Dismiss state with dedicated filter views (Saved, Read, Dismissed — independent, ANDable, with a "Restore" path back for anything dismissed), and a Profile page (editable display name, theme setting, FAQ)
- **Design:** two full visual identities — an amber-and-serif system, then a deep-green "Broadsheet" editorial redesign — each applied consistently across cards, sidebar, mobile nav, and auth pages; real dark mode (explicit toggle + persisted preference, not OS-driven) capped off with a sun/moon pill switch in the header
- **Performance:** cursor-based pagination and DB-side nod aggregation replaced an O(articles × nods) full-table fetch on every page load
- **Mobile/PWA:** installable PWA with Web Share Target support on Android (native share sheet) and iOS (via a one-time Shortcut, now documented in the Profile page's FAQ)
- **Reliability:** server-side input validation, sanitized error messages, honest DELETE semantics, themed error/404 pages, rate limiting + outbound caching on external-API routes, boot-time env var validation, structured `[route-name]`-prefixed logging, and a round of fixes caught by a deliberate self-review (see above) rather than left for users to find
- **Docs:** the same suite as before, kept current every session — `CLAUDE.md`, `DECISIONS.md`, `BACKLOG.md`, `README.md`, `RELEASE_NOTES.md`, and this file

### Where things stand

Beta-ready for a small trusted group, and closer to public-launch ready than last check-in — pagination/DB-side nod counts (a former launch blocker) is done. Two launch blockers remain: enforcing the access model in code rather than a Supabase dashboard toggle (partially closed — `shouldCreateUser: false` shipped, an allowlist/invite-flow check is still open), and moving off Supabase's dev-only email sender to a real SMTP provider. Full detail in `BACKLOG.md`'s "Path to public launch" section.
