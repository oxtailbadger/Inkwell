-- Run this in your Supabase SQL editor

create table public.articles (
  id uuid default gen_random_uuid() primary key,
  url text not null,
  title text,
  description text,
  image_url text,
  site_name text,
  submitted_by uuid references auth.users(id) on delete cascade not null,
  tags text[] default '{}',
  archive_url text,
  created_at timestamptz default now() not null
);

-- Run this if the table already exists:
-- alter table public.articles add column if not exists archive_url text;

-- Users can read all articles, but only insert/update/delete their own
alter table public.articles enable row level security;

create policy "Anyone authenticated can read articles"
  on public.articles for select
  to authenticated
  using (true);

create policy "Users can insert their own articles"
  on public.articles for insert
  to authenticated
  with check (auth.uid() = submitted_by);

create policy "Users can delete their own articles"
  on public.articles for delete
  to authenticated
  using (auth.uid() = submitted_by);

-- Index for fast tag filtering and recency sorting
create index articles_created_at_idx on public.articles(created_at desc);
create index articles_tags_idx on public.articles using gin(tags);
