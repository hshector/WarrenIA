-- Products chosen for each block of the plan (core / diversifiers / momentum):
-- {"core": [{"isin": "...", "weight": 1}], "gold": [...], "momentum": [...]}
alter table public.settings add column if not exists choices jsonb not null default '{}'::jsonb;
