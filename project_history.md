# Inkwell — Project History

A running record of work sessions on Inkwell, kept for continuity across sessions and models. Update this after every few sessions rather than every commit — it's a narrative log, not a changelog (see `RELEASE_NOTES.md` for user-facing changes and `git log` for the full commit history).

---

## As of July 7, 2026

### Timeline

**Started:** June 24, 2026 (initial commit + v0 build)
**Most recent commit:** July 7, 2026, 4:50 PM
**Span:** ~13 days across 7 working sessions

| Session | Date | Time span | Commits | Focus |
|---|---|---|---|---|
| 1 | Jun 24 | 20:56–22:15 (1h19m) | 4 | Initial build — Pocket-style article sharing, quill icon, tagline |
| 2 | Jun 29 | 21:24–22:38 (1h14m) | 9 | Microlink swap, antibot fallback, author RSS feed, sidebar nav, Nods |
| 3 | Jul 2 | 21:31–22:32 (1h01m) | 8 | Mobile nav, display names, PWA share target, archive.today auto-suggest |
| 4 | Jul 4 | 09:54 | 1 | Share-page landing tests |
| 5 | Jul 6 | 22:29–22:43 (14m) | 2 | OTP code login, Phil Gaimon author |
| 6 | Jul 7 (AM) | 10:46–12:28 (1h42m) | 7 | Authors/article card redesign, amber theme, public-launch code review |
| 7 | Jul 7 (PM) | 15:24–16:50 (1h26m) | 5 | Favicons, validation/error sanitization, README/proxy/error pages, design-system + a11y pass, login page |

### The numbers

- **35 commits total**, all pushed to `main` (pushes happen immediately after each commit in this workflow, so pushes ≈ commits — git doesn't log push events separately, so this is inferred, not counted directly)
- **~6.9 hours** of active coding time, measured as first-commit-to-last-commit span per session. This is a **lower bound** — it excludes research, design review, browser testing, and planning conversation before the first commit or after the last one in a session
- **52 tests** in the current suite (started at 0)
- **4 Claude Design handoffs** implemented (authors section, article cards, plus two theme/style passes)
- **1 acquisition-style code review** conducted, converted into a 15-item public-launch backlog

### What shipped

Went from a bare Next.js starter to a themed, tested, documented PWA:

- **Core product:** magic-link + OTP auth, Supabase-backed article sharing with Nods (upvotes), a curated-author RSS feed (Ben Thompson, Derek Thompson, Phil Gaimon) with paywall filtering
- **Design:** an amber-and-serif design system applied consistently across article cards, the authors section, sidebar, mobile nav, and login — built from two Claude Design handoffs, then extended app-wide
- **Mobile/PWA:** installable PWA with Web Share Target support on Android (native share sheet) and iOS (via a one-time Shortcut)
- **Reliability:** server-side input validation, sanitized error messages (no more leaking raw Postgres errors to the client), honest DELETE semantics (404/403 vs. a silent no-op), themed error/404 pages
- **Docs:** a full suite — `CLAUDE.md` (architecture), `DECISIONS.md` (non-obvious choices and why), `BACKLOG.md` (prioritized todo, including a public-launch readiness section), `README.md` (human onboarding), `RELEASE_NOTES.md` (user-facing changelog), and this file — that lets a fresh session, or a different model entirely, pick up cold.

### Where things stand

Beta-ready for a small trusted group; not yet public-launch ready. The biggest open items before opening signups further: enforcing the access model in code (not just a Supabase dashboard toggle), pagination + database-side nod counts, and moving off Supabase's dev-only email sender. Full detail in `BACKLOG.md`'s "Path to public launch" section.
