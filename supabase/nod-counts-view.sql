-- Run this in your Supabase SQL editor

-- Moves nod-count aggregation from JS (fetchEnrichedArticles used to pull
-- every nod for the page's articles and .filter().length in a loop) into
-- Postgres.
--
-- `security_invoker = true` is important: without it a Postgres view runs
-- against its underlying tables as the *view owner* (SECURITY DEFINER
-- behavior), which BYPASSES the querying user's RLS on `nods` — Supabase's
-- linter flags exactly this. With it on, the view reads `nods` as the
-- calling user, so `nods`'s own RLS still applies. Harmless today (nod
-- counts are public and `nods` SELECT is `using (true)` for everyone), but
-- the correct default: if `nods` RLS is ever tightened, this view won't
-- silently leak around it. A view still needs its own explicit grant.
create view public.article_nod_counts
with (security_invoker = true) as
select article_id, count(*)::int as nod_count
from public.nods
group by article_id;

grant select on public.article_nod_counts to authenticated;

-- For a project that already has this view from before security_invoker
-- was set, run this instead of recreating it:
--   alter view public.article_nod_counts set (security_invoker = on);
