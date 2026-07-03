-- Run this in your Supabase SQL editor.
-- PostgREST cannot join auth.users (see DECISIONS.md), so we mirror the bits
-- we need into a public.profiles table kept in sync by a signup trigger.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Anyone authenticated can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile on signup, defaulting display_name to the email prefix
-- ("paul.stanton5@gmail.com" -> "paul.stanton5"). Users can rename later.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users who signed up before this table existed
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1)
from auth.users
on conflict (id) do nothing;
