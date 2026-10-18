-- Run this in your Supabase SQL editor (safe to re-run).
--
-- Duplicate-link protection. Run it AFTER launch-hardening.sql.
--
-- Before: nothing stopped the same article being shared again and again — by
-- accident, or on purpose — and "the same article" is rarely the same string:
--   https://www.example.com/story?utm_source=newsletter
--   https://example.com/story/
--   http://example.com/story#comments
-- are all one article. So the rule is enforced on a *canonical* form of the URL.
--
-- Design notes (see DECISIONS.md):
--  * Canonicalizing lives ONLY here, in SQL. The app never computes or sends the
--    canonical form — it just recognizes the unique-violation and turns it into a
--    friendly message. A TypeScript copy would have to agree with this character
--    for character or the two would disagree about what counts as a duplicate.
--  * A trigger fills url_canonical, so a client can't spoof it and no app code
--    has to know the column exists. That also makes the app safe to deploy
--    BEFORE you run this file: until the index below exists, nothing can raise
--    the duplicate error, so sharing behaves exactly as it does today.
--  * The unique index is created only if no duplicates exist yet (it can't be
--    built otherwise). See "Existing duplicates" at the bottom: the last query
--    in this file tells you whether protection is on.

-- ── 1. The canonical form ───────────────────────────────────────────────────
-- What counts as "the same link":
--   * scheme: http and https are the same (stored canonical form is always https)
--   * host: case-insensitive, a leading "www." is ignored, default ports dropped,
--     any user:password@ dropped
--   * path: case-sensitive (paths are), trailing slashes ignored; no path = "/"
--   * query: tracking parameters dropped (utm_*, fbclid, gclid, ...), the rest
--     sorted so ?a=1&b=2 == ?b=2&a=1; real parameters (?id=5, ?v=abc) are kept
--   * fragment (#...) ignored
-- Different subdomains (blog.example.com vs example.com) stay different.
create or replace function public.canonicalize_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  u     text := btrim(p_url);
  m     text[];
  host  text;
  path  text;
  query text;
  kept  text;
begin
  if u is null or u = '' then
    return null;
  end if;

  u := regexp_replace(u, '#.*$', '');
  m := regexp_match(u, '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#]*)([^?#]*)(?:\?(.*))?$');
  if m is null then
    -- Not an absolute URL (content-constraints.sql requires http(s)://, so this
    -- shouldn't happen); fall back to a lowercased trim rather than failing
    return lower(u);
  end if;

  host  := lower(m[1]);
  path  := coalesce(m[2], '');
  query := m[3];

  host := regexp_replace(host, '^.*@', '');        -- user:password@
  host := regexp_replace(host, ':(80|443)$', '');   -- default ports
  host := regexp_replace(host, '^www\.', '');

  if path = '' then
    path := '/';
  elsif length(path) > 1 then
    path := regexp_replace(path, '/+$', '');
    if path = '' then path := '/'; end if;
  end if;

  if query is not null and query <> '' then
    select string_agg(p, '&' order by p)
      into kept
      from unnest(string_to_array(query, '&')) as p
     where p <> ''
       and lower(split_part(p, '=', 1)) !~
           '^(utm_.*|fbclid|gclid|dclid|msclkid|yclid|mc_cid|mc_eid|igshid|igsh|_hsenc|_hsmi|mkt_tok)$';
  end if;

  return 'https://' || host || path ||
         case when kept is not null and kept <> '' then '?' || kept else '' end;
end;
$$;

-- A pure string function: harmless for anyone to call, and revoking EXECUTE from
-- PUBLIC would make the trigger below fail for any role that isn't explicitly
-- granted it (service_role scripts, for instance).

-- ── 2. The column, kept up to date by a trigger ─────────────────────────────
alter table public.articles add column if not exists url_canonical text;

create or replace function public.articles_set_canonical_url()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.url_canonical := public.canonicalize_url(new.url);
  return new;
end;
$$;

drop trigger if exists articles_canonical_url on public.articles;
create trigger articles_canonical_url
  before insert or update of url on public.articles
  for each row execute function public.articles_set_canonical_url();

-- Backfill rows that existed before this file was first run
update public.articles
   set url_canonical = public.canonicalize_url(url)
 where url_canonical is distinct from public.canonicalize_url(url);

-- ── 3. The rule: one article per canonical URL ──────────────────────────────
-- Only built when there are no duplicates yet; otherwise it would fail and roll
-- back this whole file. Resolve duplicates (below), then re-run.
do $$
begin
  if not exists (
    select 1 from public.articles
     where url_canonical is not null
     group by url_canonical
    having count(*) > 1
  ) then
    create unique index if not exists articles_url_canonical_key
      on public.articles (url_canonical);
  end if;
end
$$;

-- ── 4. "Who already shared this?" — used to write a helpful message ─────────
-- When the index rejects a share, the app asks this so it can say "Priya already
-- shared this link" instead of a generic error. SECURITY INVOKER: it runs as the
-- caller, so RLS applies (every signed-in user may read articles and profiles).
create or replace function public.find_shared_article(p_url text)
returns table (
  id          uuid,
  title       text,
  submitted_by uuid,
  shared_by   text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.title, a.submitted_by, p.display_name, a.created_at
    from public.articles a
    left join public.profiles p on p.id = a.submitted_by
   where a.url_canonical = public.canonicalize_url(p_url)
   order by a.created_at
   limit 1;
$$;

revoke all on function public.find_shared_article(text) from public, anon;
grant execute on function public.find_shared_article(text) to authenticated;

-- ── Existing duplicates ─────────────────────────────────────────────────────
-- If the status query at the bottom says protection is NOT on, some links were
-- already shared more than once. To see them (un-comment and run on its own):
--
--   select a.url_canonical, a.id, a.title, a.created_at,
--          p.display_name as shared_by, coalesce(n.nod_count, 0) as nods
--     from public.articles a
--     join (select url_canonical from public.articles
--            group by url_canonical having count(*) > 1) d using (url_canonical)
--     left join public.profiles p on p.id = a.submitted_by
--     left join public.article_nod_counts n on n.article_id = a.id
--    order by a.url_canonical, a.created_at;
--
-- Decide which copy to keep, delete the others from the Table editor (their Nods
-- and Saved/Read marks are deleted with them — that cascade is the cost of a
-- duplicate), then re-run this file. If you'd rather keep the EARLIEST share of
-- each and drop the rest automatically, this does exactly that. It is
-- DESTRUCTIVE and off by default:
--
--   delete from public.articles a
--    using public.articles b
--    where a.url_canonical = b.url_canonical
--      and (a.created_at, a.id) > (b.created_at, b.id);

-- ── Status (the result you'll see in the SQL editor) ────────────────────────
select case
  when exists (select 1 from pg_indexes
                where schemaname = 'public' and indexname = 'articles_url_canonical_key')
    then 'OK: duplicate-link protection is ON'
  else 'NOT YET: ' || (
         select count(*) from (
           select 1 from public.articles
            where url_canonical is not null
            group by url_canonical having count(*) > 1
         ) d
       ) || ' link(s) were already shared more than once, which blocks the unique '
         || 'index. Resolve them (see "Existing duplicates" above), then re-run this file.'
end as status;
