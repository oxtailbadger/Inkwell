-- Run this in your Supabase SQL editor

create table public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null,
  created_at timestamptz default now() not null
);

alter table public.feedback enable row level security;

-- Insert-only by design. Authenticated users can submit their own feedback,
-- but there is deliberately NO select policy: feedback is read by the app
-- owner directly in the Supabase dashboard (service role, which bypasses
-- RLS), never through the app. Without a select policy, no user — not even
-- the author — can read any feedback row back out via the client, so one
-- user can never see another's.
create policy "Users can submit their own feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- `email` is captured server-side from the authenticated user at submit time
-- (denormalized, same philosophy as profiles.display_name — the app never
-- joins auth.users), so the feedback table is readable on its own without a
-- join. `on delete set null` keeps feedback if an account is later removed.

-- Newest feedback first when you read it:
create index feedback_created_at_idx on public.feedback(created_at desc);
