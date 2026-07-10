# Inkwell — Scaling Beyond One Community (design notes)

**Status:** exploratory. Nothing here is committed or scheduled — this is a decision aid for if/when Inkwell grows past a single friend group. Written 2026-07-10.

This document captures the trade-offs between three futures for Inkwell:

- **Option A** — one larger Inkwell *you* operate, hosting many independent communities (multi-tenant SaaS).
- **Option B** — other people run *their own* Inkwell instance (self-hosted, one community each).
- **Option C** — Inkwell as a *single-user* article-saving platform (personal read-it-later), no social layer.

They are not mutually exclusive over time (see [Staged path](#staged-path)), but each implies very different engineering, operational, and legal burdens.

---

## Baseline: what Inkwell is today

So this doc stands on its own, the relevant facts about the current architecture:

- **Single community.** One Vercel deployment, one Supabase project. Every authenticated user is assumed to be in the one trusted friend group.
- **RLS is `using (true)` for reads.** Every row-level-security *read* policy grants access to any authenticated user; writes are scoped to the owner (`auth.uid() = submitted_by` / `= user_id`). Privacy currently depends partly on the unversioned Supabase "allow new signups" dashboard toggle plus `signInWithOtp({ shouldCreateUser: false })`.
- **Access is a manual allowlist.** New members are added by hand in the Supabase dashboard. There is no self-serve signup and no invite flow.
- **Schema is hand-run SQL.** ~7 files in `supabase/*.sql`, run by hand in order, no migration tooling.
- **Auth** is Supabase magic-link / email OTP, on Supabase's built-in (dev-only, rate-limited) email sender.
- **Rate limiting is in-memory / per-instance** (`lib/rate-limit.ts`) — fine for one small group, not durable or shared across serverless instances.
- **Tables:** `articles`, `nods`, `article_nod_counts` (view, `security_invoker`), `article_state` (per-user saved/read/dismissed — already private, `auth.uid() = user_id`), `authors` (one global curated set), `profiles`, `feedback`.
- **Tests mock Supabase.** The suite exercises route/logic behavior with hand-built Supabase mocks; **RLS itself is never exercised by a test.** That's acceptable for one community; it becomes a material gap for any option where RLS is the wall between tenants.

Four items already on the [BACKLOG](BACKLOG.md) "Path to public launch" are prerequisites for *any* of these options: **adopt migrations**, **custom SMTP**, **enforce the access model in code (not a dashboard toggle)**, and the **invite flow**.

---

## Option A — You operate one larger, multi-tenant Inkwell

One deployment and one Supabase, hosting many friend-communities that cannot see each other. The defining shift: **data isolation becomes a code problem enforced on every query, not a "who did I add in the dashboard" problem.**

### Data model
- New `communities` table (`id`, `name`, `slug`, `owner`, `created_at`).
- New `community_members` table (`community_id`, `user_id`, `role` [owner/member], `joined_at`) — this *is* the membership + per-community allowlist.
- Add `community_id` to every content table: `articles`, `article_state`, `authors`, `feedback`. `nods` inherit community via their article.
- `authors` becomes **per-community** — each group curates its own RSS feeds (today it's one global seed).
- `article_nod_counts` becomes community-scoped (falls out naturally once nods carry community via article).
- `profiles` can stay global (one identity across communities) or go per-community (different display name per group) — a decision, not a blocker.

### RLS — the crux and the risk
- Every `using (true)` read policy is rewritten to something like `community_id in (select community_id from community_members where user_id = auth.uid())`, backed by a helper `is_member(community_id)` function. This touches **every table and every policy.**
- Write policies must additionally verify the writer belongs to the community they're writing into.
- **The load-bearing risk:** in multi-tenant mode RLS is the *only* wall between communities. A single wrong policy silently leaks Group A's data to Group B. The current test suite mocks Supabase and never runs real RLS, so this option **requires a new integration-test harness against a live Supabase** — a capability the project does not have today.

### Auth & onboarding
- Open self-serve signup (today deliberately closed).
- "Create a community" flow (creator becomes owner); invite-by-email flow; a **community switcher** for people in more than one group.
- Custom SMTP (Resend/Postmark with SPF/DKIM) becomes **mandatory** — the Supabase dev sender caps at a few emails/hour.

### App / UX / ops
- Community context threads through every query, the URL, and server fetches.
- Owner surfaces: manage/remove members, moderate content.
- Abuse controls: public signup invites spam. Today's in-memory rate limiting is per-instance; this needs **durable, shared** rate limiting (e.g. Upstash/Redis).
- Supabase CLI migrations (hand-run SQL does not scale to a live service with many tenants).
- Backups, monitoring, on-call — you are now a service operator.
- **Legal:** you become the data controller for other people's data — Terms of Service, privacy policy, GDPR/data-deletion obligations, abuse reporting.

### Verdict
Highest engineering effort, ongoing operational and legal responsibility — but it's a genuine product you could monetize.

---

## Option B — Others run their own instance

Inkwell stays single-community; the work is making it **easy for a semi-technical person to deploy their own copy** (their own Vercel + their own Supabase). No multi-tenancy in code, no shared data, no ops burden on you.

### Mostly packaging, not restructuring
- Consolidate the ~7 hand-run `supabase/*.sql` files into **one idempotent setup script or Supabase migrations**, so a new operator runs *one* thing (the BACKLOG "adopt migrations" item does double duty here).
- Authors are already table-driven (no code change to edit a feed) — just document it, or add a tiny admin UI so operators never touch SQL.
- A one-click **Deploy to Vercel** button plus a setup guide (the README already has good bones). `instrumentation.ts` already fails fast on missing env vars — a solid first-run guardrail.

### De-hardcode what assumes "it's *your* Inkwell"
- Branding: the name "Inkwell", the quill mark, the Broadsheet palette.
- The iOS Shortcut iCloud URL (currently a specific link in the profile FAQ).
- FAQ copy and the feedback recipient (their feedback lands in *their* Supabase — already self-contained).
- Make these configurable via env/config, or at minimum clearly flag them as "change these."

### Auth & access
- Each operator manages their own email allowlist in their own Supabase (exactly what you do today) and brings their own SMTP.
- "Enforce access in code" still matters so a fresh operator isn't relying on a dashboard toggle they don't know about.

### Distribution
- Pick a license (MIT vs AGPL, etc.).
- Setup / upgrade / troubleshooting docs.
- Your only burden is answering GitHub issues — **no ops, no legal exposure for their data.**

### Verdict
Much lower effort and risk than A; the trade-off is it only reaches people willing to deploy something.

---

## Option C — Inkwell as a single-user article-saving platform

A personal **read-it-later / bookmarking** tool: save links, tag them, mark them read, keep optional curated author feeds — with no shared feed and no social layer. Notably, this is the **closest to the current code** of the three, because the per-user private layer already exists: `article_state` (saved/read/dismissed) is already RLS-scoped to `auth.uid() = user_id`.

Think of it as "tenant = one individual," which is simpler than Option A because scoping by `auth.uid()` needs no membership join.

### What changes
- **`articles` becomes private.** Flip its read policy from `using (true)` to `using (submitted_by = auth.uid())` so each person only sees their own saved articles. (This single policy change is most of the security work — versus rewriting every policy in Option A.)
- **Drop or repurpose the social primitives:**
  - `nods` (public upvotes) become meaningless with one user — remove, or repurpose as a private **star/favorite** flag (arguably just another boolean on `article_state`, alongside saved/read/dismissed).
  - Submitter-name enrichment and "shared by …" bylines go away.
  - `article_nod_counts` view is dropped (or repurposed for personal favorites).
- **`authors` / AuthorFeed** stays as an *optional* personal-reading add-on (curated RSS you follow), or is cut for a pure bookmarking tool. Low stakes either way.
- **`feedback`** is optional — it's your own tool, though a self-hoster might keep it.
- **UI simplification:** the feed becomes "my library"; the Saved/Read/Dismissed filters (already built) become the primary navigation; SubmitArticle becomes "save a link." The "Read free ↗" archive links and tag filtering carry over unchanged and are genuinely useful for a solo reader.

### Two ways to ship it
1. **A "solo mode" config flag** on the same codebase — one deploy behaves as a private library when a flag is set, as the friend-group app otherwise. Keeps one code path but adds conditional branches.
2. **A separate build/product** — a cleaner story ("Inkwell Solo") without social-feature dead code, at the cost of maintaining a divergence.

### Verdict
**Lowest effort of the three** and lowest risk — it's mostly *removing* surface area and tightening one RLS policy, over an already-per-user foundation. It's also the most different *product*: a personal tool, not a group one. Pairs naturally with Option B (a self-hosted personal instance) and could even be the on-ramp UX for Option A (you start solo, then create or join a community).

---

## Side by side

| | A — You host multi-tenant | B — They self-host | C — Single-user tool |
|---|---|---|---|
| Engineering effort | High (tenancy + RLS everywhere) | Low–moderate (packaging, docs) | **Lowest** (remove social, tighten 1 policy) |
| Data-leak risk | High — RLS is the only wall | Low — separate DBs | Low — per-user `auth.uid()` scoping |
| Your ops burden | High (you run a service) | ~None | Depends (yours if hosted, theirs if self-host) |
| Your legal/data burden | High (controller for others' data) | ~None | ~None (or just your own users) |
| Reach for end users | Frictionless (sign up, make a group) | Needs someone technical per community | Frictionless (sign up, save links) |
| Product shape | Group SaaS | Group, self-run | Personal tool |
| Money | Chargeable SaaS | Give-away/OSS | Chargeable SaaS or OSS |
| Closeness to today's code | Far | Near | **Nearest** |

**Shared prerequisites (all already on the BACKLOG):** adopt migrations, custom SMTP, enforce the access model in code (not a dashboard toggle), and — for A/B group modes — the invite flow.

---

## Staged path

If any of this is ever pursued, the low-regret ordering:

1. **Do the four shared prerequisites first** — they're on the public-launch list regardless of which direction you choose.
2. **Ship the cheap thing to learn from real users** — either **B** (let a couple of technical friends self-host and report back) or **C** (a personal-library mode, nearly free given the existing per-user layer).
3. **Only build A if there's genuine demand *and* you want to run a service** — it carries real operational and legal weight.

B and C can each grow toward A later (B → managed hosting = A; C → "create a community" = A). The reverse — unwinding multi-tenancy back into a simple app — is much harder. So don't build A speculatively.
