-- Run this in your Supabase SQL editor (safe to re-run).
--
-- Sections: Articles and Podcasts. Run it AFTER duplicate-links.sql (it uses
-- canonicalize_url()).
--
-- A link to an episode on Apple Podcasts or Spotify belongs in a Podcasts
-- section, not mixed in with articles. Each article gets a `kind` — 'article' or
-- 'podcast' — decided automatically from its URL, and the feed function takes a
-- section so each section is its own list (same Nods, Save/Read/Dismiss, tags
-- and pagination).
--
-- Design notes (see DECISIONS.md):
--  * Classification lives ONLY here, in SQL, like the duplicate-link rule: the
--    app never decides what a podcast is. A trigger fills `kind`, so a client
--    can't choose it, and a TypeScript copy can't drift from this.
--  * feed_articles() now lives in THIS file, not launch-hardening.sql. Adding a
--    parameter to a Postgres function creates a second overload instead of
--    replacing it, and launch-hardening.sql is documented as safe to re-run —
--    re-running it would resurrect the old signature next to this one and make
--    the feed's RPC call ambiguous. One definition, in one file.
--  * Compatible in both orders. The new parameter has a default of 'articles',
--    so an older app calling with the old arguments still works (and now simply
--    stops seeing podcasts); the new app only sends the parameter for the
--    Podcasts section, so it works before this file is run too.

-- ── 1. What counts as a podcast ─────────────────────────────────────────────
-- Works on the canonical URL (https, lowercase host, no www., no fragment).
--
-- Hosts where everything is a podcast: the podcast apps/directories and the big
-- podcast hosting platforms. Hosts that serve other things too (Spotify, NPR,
-- iHeart, Amazon Music, TuneIn, Pandora) are matched by PATH instead — a Spotify
-- *track*, *album* or *playlist* is music, and stays an article.
--
-- Deliberately NOT handled: link shorteners (spotify.link, spoti.fi, bit.ly,
-- t.co) — resolving them means a network request, which a database function
-- must not make. They stay articles.
create or replace function public.classify_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c    text := public.canonicalize_url(p_url);
  m    text[];
  host text;
  path text;
begin
  if c is null then
    return 'article';
  end if;

  m := regexp_match(c, '^https://([^/?#]*)([^?#]*)');
  if m is null then
    return 'article';
  end if;
  host := m[1];                 -- already lowercase, no "www."
  path := lower(coalesce(m[2], ''));

  -- Everything on these hosts (and their subdomains) is a podcast
  if host ~ '(^|\.)(podcasts\.apple\.com|podcasts\.google\.com|overcast\.fm|pca\.st|pocketcasts\.com|castro\.fm|castbox\.fm|player\.fm|podcasters\.spotify\.com|anchor\.fm|acast\.com|podbean\.com|buzzsprout\.com|libsyn\.com|simplecast\.com|transistor\.fm|megaphone\.fm|omny\.fm|audioboom\.com|radiopublic\.com|fireside\.fm|captivate\.fm|podchaser\.com|listennotes\.com)$' then
    return 'podcast';
  end if;

  -- Spotify: only episodes and shows. Allows a locale prefix (/intl-de/,
  -- /intl-pt-br/) and the embed form (/embed/episode/...).
  if host = 'open.spotify.com'
     and path ~ '^(/intl-[a-z]{2}(-[a-z]{2})?)?(/embed)?/(episode|show)(/|$)' then
    return 'podcast';
  end if;

  -- Older iTunes links, e.g. itunes.apple.com/us/podcast/some-show/id123
  if host = 'itunes.apple.com' and path ~ '/podcast/' then
    return 'podcast';
  end if;

  if host ~ '(^|\.)iheart\.com$' and path ~ '^/podcast/' then return 'podcast'; end if;
  if host ~ '(^|\.)npr\.org$' and path ~ '^/podcasts/' then return 'podcast'; end if;
  if host ~ '(^|\.)tunein\.com$' and path ~ '^/podcasts/' then return 'podcast'; end if;
  if host ~ '(^|\.)pandora\.com$' and path ~ '^/podcast/' then return 'podcast'; end if;
  if host ~ '^music\.amazon\.' and path ~ '^/podcasts/' then return 'podcast'; end if;

  return 'article';
end;
$$;

-- ── 2. The column, kept up to date by a trigger ─────────────────────────────
-- NOT NULL with a default: every existing row is an article until the backfill
-- below, and a client can never insert a NULL kind.
alter table public.articles add column if not exists kind text not null default 'article';

alter table public.articles drop constraint if exists articles_kind_valid;
alter table public.articles
  add constraint articles_kind_valid check (kind in ('article', 'podcast'));

create or replace function public.articles_set_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.kind := public.classify_url(new.url);
  return new;
end;
$$;

drop trigger if exists articles_kind on public.articles;
create trigger articles_kind
  before insert or update of url on public.articles
  for each row execute function public.articles_set_kind();

-- Sort what's already been shared. Podcast links shared before this file existed
-- move to the Podcasts section.
update public.articles
   set kind = public.classify_url(url)
 where kind is distinct from public.classify_url(url);

-- The feed filters on kind and orders by (created_at, id)
create index if not exists articles_kind_feed_idx
  on public.articles (kind, created_at desc, id desc);

-- ── 3. The feed function, with a section ────────────────────────────────────
-- Same behaviour as before (see the notes in git history for launch-hardening.sql:
-- hide what I've dismissed; p_dismissed shows ONLY those; saved/read/tag are
-- independent toggles that AND together; keyset cursor on (created_at, id)),
-- plus p_section: 'articles' (the default), 'podcasts', or 'all' (both mixed,
-- newest first). Any other value matches nothing, rather than silently
-- meaning "articles".
--
-- SECURITY INVOKER, and it must stay that way: article_state is per-user
-- private, and a definer-context version would leak every user's saved / read /
-- dismissed rows. auth.uid() comes from the caller's JWT, never a parameter.
--
-- The old 7-argument version is dropped explicitly: `create or replace` with a
-- different argument list would ADD an overload and leave the old one callable
-- (which would still return podcasts, and make named-argument calls ambiguous).
drop function if exists public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer);

create or replace function public.feed_articles(
  p_tag               text        default null,
  p_saved             boolean     default false,
  p_read              boolean     default false,
  p_dismissed         boolean     default false,
  p_before_created_at timestamptz default null,
  p_before_id         uuid        default null,
  p_limit             integer     default 25,
  p_section           text        default 'articles'
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
  where (
          coalesce(p_section, 'articles') = 'all'
          or a.kind = case coalesce(p_section, 'articles')
                        when 'articles' then 'article'
                        when 'podcasts' then 'podcast'
                      end
        )
    and (p_tag is null or a.tags @> array[p_tag])
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

revoke all on function public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer, text)
  from public, anon;
grant execute on function public.feed_articles(text, boolean, boolean, boolean, timestamptz, uuid, integer, text)
  to authenticated;

-- ── Status (the result you'll see in the SQL editor) ────────────────────────
select
  count(*) filter (where kind = 'podcast') as podcasts,
  count(*) filter (where kind = 'article') as articles,
  case
    when count(*) filter (where kind = 'podcast') = 0
      then 'OK: sections are set up. No existing links were podcasts.'
    else 'OK: sections are set up. ' || count(*) filter (where kind = 'podcast')
         || ' existing link(s) moved to Podcasts.'
  end as status
from public.articles;
