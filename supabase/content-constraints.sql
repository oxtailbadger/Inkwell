-- Run this in your Supabase SQL editor (safe to re-run).
--
-- Why this exists: the API routes validate input (lib/validate.ts), but the
-- API is NOT the only way into the database. Supabase exposes PostgREST
-- directly, the anon key ships in the JS bundle, and the RLS policies on
-- articles/profiles/feedback only check *ownership* (auth.uid() = ...), not
-- content. So any signed-in user can POST straight to /rest/v1/articles and
-- skip validateHttpUrl, the length caps, and the rate limiters entirely.
-- These CHECK constraints make the database enforce the same limits, so the
-- API validation becomes a friendly-error layer rather than the only wall.
--
-- Limits mirror lib/validate.ts — keep the two in sync. The DB is never
-- *stricter* than the API for a value the API accepts (char_length counts
-- characters, JS .length counts UTF-16 units, so Postgres is <= JS), so a
-- legitimate share can't be rejected here after passing the API.
--
-- Constraints are added NOT VALID: enforced for every new/updated row
-- immediately, without scanning or failing on rows that already exist. See
-- the VALIDATE block at the bottom to check existing data once you're ready.

-- ── articles ────────────────────────────────────────────────────────────────

alter table public.articles drop constraint if exists articles_url_http;
alter table public.articles add constraint articles_url_http
  check (url ~* '^https?://' and char_length(url) <= 2000) not valid;

alter table public.articles drop constraint if exists articles_title_len;
alter table public.articles add constraint articles_title_len
  check (title is null or char_length(title) <= 500) not valid;

alter table public.articles drop constraint if exists articles_description_len;
alter table public.articles add constraint articles_description_len
  check (description is null or char_length(description) <= 2000) not valid;

alter table public.articles drop constraint if exists articles_site_name_len;
alter table public.articles add constraint articles_site_name_len
  check (site_name is null or char_length(site_name) <= 200) not valid;

-- Optional URL columns are rendered as <img src> / <a href> to every viewer,
-- so they get the same scheme + length rule as `url`.
alter table public.articles drop constraint if exists articles_image_url_http;
alter table public.articles add constraint articles_image_url_http
  check (image_url is null or (image_url ~* '^https?://' and char_length(image_url) <= 2000)) not valid;

alter table public.articles drop constraint if exists articles_site_icon_url_http;
alter table public.articles add constraint articles_site_icon_url_http
  check (site_icon_url is null or (site_icon_url ~* '^https?://' and char_length(site_icon_url) <= 2000)) not valid;

alter table public.articles drop constraint if exists articles_archive_url_http;
alter table public.articles add constraint articles_archive_url_http
  check (archive_url is null or (archive_url ~* '^https?://' and char_length(archive_url) <= 2000)) not valid;

-- At most 12 tags of at most 40 chars each (lib/validate.ts). A CHECK can't
-- iterate array elements, so the per-tag cap is enforced as a total-size bound:
-- 12 tags * 40 chars + 11 commas = 491, rounded to 500.
alter table public.articles drop constraint if exists articles_tags_bound;
alter table public.articles add constraint articles_tags_bound
  check (
    coalesce(cardinality(tags), 0) <= 12
    and char_length(coalesce(array_to_string(tags, ','), '')) <= 500
  ) not valid;

-- ── profiles ────────────────────────────────────────────────────────────────

-- "Not blank" is `~ '[^[:space:]]'` (has a non-whitespace char), deliberately
-- not `btrim(x) <> ''`: btrim only strips spaces, so a name of tabs/newlines
-- would pass. JS .trim() in the API strips all whitespace, so this matches it.
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (char_length(display_name) between 1 and 60 and display_name ~ '[^[:space:]]') not valid;

-- The signup trigger copies the email local-part into display_name. Local-parts
-- can be up to 64 chars, so without truncation the 60-char constraint above
-- would make signup itself fail for such an address. Truncate, and fall back to
-- a placeholder rather than ever inserting an empty name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when left(split_part(new.email, '@', 1), 60) ~ '[^[:space:]]'
        then left(split_part(new.email, '@', 1), 60)
      else 'user'
    end
  );
  return new;
end;
$$;

-- ── feedback ────────────────────────────────────────────────────────────────

alter table public.feedback drop constraint if exists feedback_message_len;
alter table public.feedback add constraint feedback_message_len
  check (char_length(message) between 1 and 4000 and message ~ '[^[:space:]]') not valid;

alter table public.feedback drop constraint if exists feedback_email_len;
alter table public.feedback add constraint feedback_email_len
  check (email is null or char_length(email) <= 320) not valid;

-- ── Existing rows (optional, run after the above succeeds) ──────────────────
-- Un-comment to find any pre-existing rows that violate a constraint:
--
--   select id, url from public.articles
--    where not (url ~* '^https?://' and char_length(url) <= 2000);
--   select id, display_name from public.profiles
--    where not (char_length(display_name) between 1 and 60 and display_name ~ '[^[:space:]]');
--
-- Fix or delete anything it returns, then promote each constraint from
-- "new rows only" to "all rows":
--
--   alter table public.articles validate constraint articles_url_http;
--   alter table public.articles validate constraint articles_title_len;
--   alter table public.articles validate constraint articles_description_len;
--   alter table public.articles validate constraint articles_site_name_len;
--   alter table public.articles validate constraint articles_image_url_http;
--   alter table public.articles validate constraint articles_site_icon_url_http;
--   alter table public.articles validate constraint articles_archive_url_http;
--   alter table public.articles validate constraint articles_tags_bound;
--   alter table public.profiles validate constraint profiles_display_name_len;
--   alter table public.feedback validate constraint feedback_message_len;
--   alter table public.feedback validate constraint feedback_email_len;
