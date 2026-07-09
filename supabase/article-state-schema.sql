-- Run this in your Supabase SQL editor

create table public.article_state (
  article_id uuid references public.articles(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  saved boolean default false not null,
  read boolean default false not null,
  dismissed boolean default false not null,
  updated_at timestamptz default now() not null,
  primary key (article_id, user_id)
);

alter table public.article_state enable row level security;

-- Private per-user state — unlike nods (public upvotes), only the owning
-- user may ever read their own saved/read/dismissed flags.
create policy "Users can read their own article state"
  on public.article_state for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own article state"
  on public.article_state for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Unlike nods (insert-or-delete a whole row), this table upserts once and
-- then flips individual columns, so it needs an update policy too.
create policy "Users can update their own article state"
  on public.article_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own article state"
  on public.article_state for delete
  to authenticated
  using (auth.uid() = user_id);
