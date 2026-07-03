-- CalTrack: favorites (quick log)
-- User-curated shortcuts to re-log frequent foods in 1–2 taps. Rows snapshot
-- the macros at save time — no FK into food_entries, so deleting a log entry
-- never kills the shortcut. `meal_default` seeds the meal picker when the
-- user quick-logs without an explicit meal context.
--
-- Run this in Supabase Dashboard → SQL Editor → New query.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  calories numeric not null check (calories >= 0),
  protein_g numeric check (protein_g >= 0),
  carbs_g numeric check (carbs_g >= 0),
  fat_g numeric check (fat_g >= 0),
  serving_grams numeric check (serving_grams > 0),
  source text not null default 'manual' check (source in ('manual','openfoodfacts')),
  external_id text,
  meal_default text check (meal_default in ('breakfast','lunch','dinner','snack')),
  created_at timestamptz not null default now(),
  -- `nulls not distinct` so manual favorites (external_id is null) still
  -- dedupe by name: the default UNIQUE treats NULLs as distinct and would
  -- allow unlimited duplicates of the same manual food. The client upserts
  -- on this key, so re-favoriting refreshes the snapshot instead of failing.
  -- Requires Postgres 15+ (any current Supabase project qualifies).
  unique nulls not distinct (user_id, name, source, external_id)
);

create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

-- RLS: owner-only, mirror of food_entries_owner_all.
alter table public.favorites enable row level security;

drop policy if exists "favorites_owner_all" on public.favorites;
create policy "favorites_owner_all" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
