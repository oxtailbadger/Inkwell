-- Run this in your Supabase SQL editor

-- Moves nod-count aggregation from JS (fetchEnrichedArticles used to pull
-- every nod for the page's articles and .filter().length in a loop) into
-- Postgres. Views inherit RLS from their underlying tables, so this stays
-- as publicly readable as `nods` itself (nod counts are public, unlike the
-- per-user article_state table) — but a view still needs an explicit grant.
create view public.article_nod_counts as
select article_id, count(*)::int as nod_count
from public.nods
group by article_id;

grant select on public.article_nod_counts to authenticated;
