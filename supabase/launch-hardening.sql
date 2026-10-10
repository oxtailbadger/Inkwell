-- Run this in your Supabase SQL editor (safe to re-run).
--
-- Pre-launch hardening, 2026-10-10. Run it AFTER the numbered schema files and
-- content-constraints.sql, and BEFORE deploying the app version that calls
-- feed_articles() below — the feed depends on that function existing.
-- Everything here is additive/idempotent, so running it early is harmless: the
-- previous app version ignores it.

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

-- ── 4. Feed filtering done in the database, not in the URL ──────────────────
-- Before: the app fetched the caller's full list of dismissed (and, for the
-- Saved/Read views, saved/read) article IDs and sent them back to PostgREST
-- inside the query URL (.not("id","in",(…)) / .in("id",…)). URLs have a hard
-- length limit (typically 8–16 KB, ~37 bytes per UUID), so a user with a few
-- hundred dismissed articles would start getting "Could not load articles".
-- Now the filtering is a join, so nothing grows with the user's history.
--
-- Semantics match the previous TypeScript exactly:
--   * default view  : hide what I've dismissed
--   * p_dismissed   : show ONLY what I've dismissed (the one asymmetric case)
--   * p_saved/p_read: each narrows to that state; they AND together and with
--                     the tag, they're independent toggles
--   * keyset cursor : (created_at, id) strictly before the given pair, newest
--                     first, so same-timestamp rows have a stable order
--
-- SECURITY INVOKER (the default, stated explicitly): runs as the caller, so
-- RLS on articles and article_state applies. Do not change this to DEFINER —
-- article_state is per-user private, and a definer-context version would leak
-- every user's saved/read/dismissed rows (see DECISIONS.md). auth.uid() comes
-- from the caller's JWT rather than a parameter, so a caller can't ask for
-- someone else's state.
create or replace function public.feed_articles(
  p_tag               text        default null,
  p_saved             boolean     default false,
  p_read              boolean     default false,
  p_dismissed         boolean     default false,
  p_before_created_at timestamptz default null,
  p_before_id         uuid        default null,
  p_limit             integer     default 25
)
returns setof public.articles
language sql
stable
security invoker
set search_path = ''
as $$
  select a.*
  from public.articles a
  left join public.article_state s
    on s.article_id = a.id
   and s.user_id = auth.uid()
  where (p_tag is null or a.tags @> array[p_tag])
    and (not coalesce(p_saved, false) or coalesce(s.saved, false))
    and (not coalesce(p_read, false)  or coalesce(s.read, false))
    and coalesce(s.dismissed, false) = coalesce(p_dismissed, false)
    and (
      p_before_created_at is null
      or (a.created_at, a.id) < (p_before_created_at, p_before_id)
    )
  order by a.created_at desc, a.id desc
  -- Callers ask for page size + 1 to detect a next page; the app caps pages at
  -- 50, so 51 is the most it can legitimately need. Clamped here too because
  -- the function is callable directly via /rest/v1/rpc.
  limit least(greatest(coalesce(p_limit, 25), 1), 51);
$$;

-- Callable by signed-in users only — not anon, not PUBLIC (functions are
-- executable by PUBLIC by default).
revoke all on function public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer)
  to authenticated;
