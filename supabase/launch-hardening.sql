-- Run this in your Supabase SQL editor (safe to re-run).
--
-- Pre-launch hardening, 2026-10-10. Run it AFTER the numbered schema files and
-- content-constraints.sql. Everything here is additive/idempotent, so running
-- it early is harmless. (feed_articles() was originally defined here; it now
-- lives in sections.sql — see section 4.)

-- ── 1. handle_new_user() shouldn't be callable by API roles ─────────────────
-- It's a SECURITY DEFINER trigger function in an exposed schema, so by default
-- anon/authenticated hold EXECUTE on it and Supabase's linter flags it. It is
-- only ever invoked by the on_auth_user_created trigger, which does not check
-- the invoking role's EXECUTE privilege at fire time (privilege is checked when
-- the trigger is created), so revoking it doesn't affect signup — verified in
-- __tests__/db-launch-hardening.test.ts.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 2. feedback.email can't be spoofed by a direct insert ───────────────────
-- The API route sets email from the session, but PostgREST accepts direct
-- inserts and the old policy only checked user_id — so a signed-in user could
-- attribute feedback to any address. Require the row's email to match the
-- email claim in the caller's own JWT. `is not distinct from` so a NULL email
-- only passes when the JWT also has none.
drop policy if exists "Users can submit their own feedback" on public.feedback;
create policy "Users can submit their own feedback"
  on public.feedback for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and email is not distinct from (auth.jwt() ->> 'email')
  );

-- ── 3. Index for per-user article_state lookups ─────────────────────────────
-- The primary key is (article_id, user_id), which can't serve "all of this
-- user's saved/read/dismissed rows" (user_id is the second column). The feed
-- and RLS both filter by user_id first.
create index if not exists article_state_user_idx
  on public.article_state (user_id);

-- ── 4. (moved) feed_articles() ───────────────────────────────────────────────
-- The feed function used to be defined here. It now lives in sections.sql, which
-- adds a section (Articles / Podcasts) parameter and DROPS the old signature.
--
-- It was moved rather than copied on purpose: this file is safe to re-run, and a
-- second definition here with the old argument list would be re-created next to
-- the new one every time (Postgres treats a different argument list as a new
-- overload), leaving two callable versions and an ambiguous RPC call.
--
-- Fresh install order: ... launch-hardening.sql, duplicate-links.sql, sections.sql.
