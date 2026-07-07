-- Run this in your Supabase SQL editor

create table public.authors (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  rss_url text not null,
  website_url text,
  created_at timestamptz default now() not null
);

alter table public.authors enable row level security;

create policy "Anyone authenticated can read authors"
  on public.authors for select
  to authenticated
  using (true);

-- Seed the authors
insert into public.authors (name, rss_url, website_url) values
  ('Ben Thompson', 'https://stratechery.com/feed/', 'https://stratechery.com'),
  ('Derek Thompson', 'https://www.derekthompson.org/feed', 'https://www.derekthompson.org');

-- Added 2026-07-06 (run separately if the table already exists):
insert into public.authors (name, rss_url, website_url) values
  ('Phil Gaimon', 'https://philgaimon.substack.com/feed', 'https://philgaimon.substack.com');
