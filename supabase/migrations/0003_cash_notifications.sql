-- 0003: cash as a plan block, and signal-change notifications (Web Push).
-- Run in Supabase: Dashboard -> SQL Editor -> paste and run. Safe to run more than once.

-- Instruments can belong to the cash block (e.g. a money-market ETF).
alter table public.instruments drop constraint if exists instruments_bucket_check;
alter table public.instruments add constraint instruments_bucket_check
  check (bucket in ('core', 'gold', 'momentum', 'cash', 'other'));

-- What to be notified about (holdings, followed stocks, new buy candidates).
alter table public.settings add column if not exists notify jsonb not null
  default '{"holdings": true, "watchlist": true, "candidates": true}'::jsonb;

-- One row per device that accepted notifications. The daily job reads them with the
-- service key; each user only sees and manages their own (RLS).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) between 20 and 200),
  auth       text not null check (char_length(auth) between 8 and 100),
  device     text check (device is null or char_length(device) <= 120),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists own_rows on public.push_subscriptions;
create policy own_rows on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated, service_role;
revoke all on public.push_subscriptions from anon;
