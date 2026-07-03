-- CalTrack: body metrics (weight tracking)
-- Time-series of body weight, one weigh-in per user per calendar day.
-- Re-logging the same day is a client-side upsert on (user_id, measured_on).
-- `profiles.current_weight_kg` remains a snapshot; the client keeps it synced
-- to the most recent row after every mutation (see useBodyMetrics).
--
-- Run this in Supabase Dashboard → SQL Editor → New query.

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  measured_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- Access path for the Historial query (newest first per user). The unique
-- constraint above already yields a (user_id, measured_on) btree that Postgres
-- can scan backwards, but the explicit desc index keeps the hot path aligned
-- with the food_entries convention.
create index if not exists body_metrics_user_measured_idx
  on public.body_metrics (user_id, measured_on desc);

-- RLS: owner-only, mirror of food_entries_owner_all.
alter table public.body_metrics enable row level security;

drop policy if exists "body_metrics_owner_all" on public.body_metrics;
create policy "body_metrics_owner_all" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
