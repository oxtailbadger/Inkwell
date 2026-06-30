-- Run this in your Supabase SQL editor

create table public.nods (
  article_id uuid references public.articles(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (article_id, user_id)
);

alter table public.nods enable row level security;

create policy "Authenticated users can read nods"
  on public.nods for select
  to authenticated
  using (true);

create policy "Users can insert their own nods"
  on public.nods for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own nods"
  on public.nods for delete
  to authenticated
  using (auth.uid() = user_id);
