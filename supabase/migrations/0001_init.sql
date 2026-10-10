-- WarrenIA schema. Every user table is isolated per user with Row Level Security.
-- Run in Supabase: Dashboard -> SQL Editor -> paste and run (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- instruments
create table if not exists public.instruments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  isin          text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  kind          text not null default 'etf' check (kind in ('etf', 'stock', 'etc', 'fund', 'other')),
  bucket        text not null default 'other' check (bucket in ('core', 'gold', 'momentum', 'other')),
  currency      text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- Where the valuation price comes from:
  --   us_market : engine's US EOD data (market_ticker, USD) converted with ECB FX
  --   eodhd     : EODHD EOD (eodhd_symbol, e.g. EUNL.XETRA), in `currency`
  --   manual    : manual prices / last trade price
  price_source  text not null default 'manual' check (price_source in ('us_market', 'eodhd', 'manual')),
  market_ticker text check (market_ticker is null or market_ticker ~ '^[A-Z0-9.\-]{1,12}$'),
  eodhd_symbol  text check (eodhd_symbol is null or eodhd_symbol ~ '^[A-Za-z0-9.\-]{1,24}$'),
  sector        text,
  created_at    timestamptz not null default now(),
  unique (user_id, isin)
);

-- --------------------------------------------------------------- transactions
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  instrument_id uuid references public.instruments (id) on delete restrict,
  type          text not null check (type in ('buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'tax', 'split')),
  trade_date    date not null,
  quantity      numeric(28, 10),
  price         numeric(28, 10),
  amount        numeric(20, 4),            -- cash amount for deposit/withdrawal/dividend/interest/fee/tax
  fees          numeric(20, 4) not null default 0,
  taxes         numeric(20, 4) not null default 0,
  currency      text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  fx_rate       numeric(20, 10) not null default 1 check (fx_rate > 0), -- EUR per 1 unit of `currency`
  split_ratio   numeric(20, 10) check (split_ratio is null or split_ratio > 0), -- new shares per old share
  note          text check (note is null or char_length(note) <= 500),
  source        text not null default 'manual' check (source in ('manual', 'csv')),
  import_hash   text,
  created_at    timestamptz not null default now(),
  constraint trade_fields check (
    (type in ('buy', 'sell') and instrument_id is not null and quantity > 0 and price >= 0)
    or (type in ('deposit', 'withdrawal', 'interest', 'fee', 'tax') and amount is not null and amount >= 0)
    or (type = 'dividend' and instrument_id is not null and amount is not null and amount >= 0)
    or (type = 'split' and instrument_id is not null and split_ratio is not null)
  ),
  unique (user_id, import_hash)
);
create index if not exists transactions_user_date on public.transactions (user_id, trade_date);

-- ------------------------------------------------------------------ watchlist
create table if not exists public.watchlist (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker   text not null check (ticker ~ '^[A-Z0-9.\-]{1,12}$'),
  note     text check (note is null or char_length(note) <= 300),
  added_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

-- ------------------------------------------------------------- manual prices
create table if not exists public.manual_prices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  instrument_id uuid not null references public.instruments (id) on delete cascade,
  price_date    date not null,
  price         numeric(28, 10) not null check (price > 0),
  unique (instrument_id, price_date)
);

-- ------------------------------------------------------------------ settings
create table if not exists public.settings (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  targets              jsonb not null default '{"core": 0.75, "gold": 0.10, "momentum": 0.15}',
  band_abs             numeric not null default 0.05,
  band_rel             numeric not null default 0.25,
  monthly_contribution numeric not null default 450,
  updated_at           timestamptz not null default now()
);

-- ------------------------------------------------------------------------ RLS
alter table public.instruments   enable row level security;
alter table public.transactions  enable row level security;
alter table public.watchlist     enable row level security;
alter table public.manual_prices enable row level security;
alter table public.settings      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['instruments', 'transactions', 'watchlist', 'manual_prices', 'settings'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ------------------------------------------------------------ market storage
-- Private bucket for the engine's data lake and published artifacts. Only the
-- secret/service key (GitHub Actions + Vercel server) can read or write it.
insert into storage.buckets (id, name, public)
values ('market', 'market', false)
on conflict (id) do nothing;
