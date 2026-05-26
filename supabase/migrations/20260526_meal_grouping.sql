-- CalTrack: meal grouping
-- Adds a meal_type bucket to every food entry so the Today screen can group
-- breakfast / lunch / dinner / snack and so future features (macros per meal,
-- copy-day) can target a specific meal.
--
-- Run this in Supabase Dashboard → SQL Editor → New query.

-- text + CHECK keeps the same shape as `source` (init migration). Existing
-- rows get the default 'snack' so they remain visible somewhere in the UI;
-- users can re-bucket them via the edit flow when it ships.
alter table public.food_entries
  add column if not exists meal_type text not null default 'snack'
  check (meal_type in ('breakfast','lunch','dinner','snack'));

-- The Today query already filters (user_id, consumed_at). Adding meal_type as
-- a trailing column keeps that path indexed and also speeds up future
-- per-meal aggregations without paying for a second index.
drop index if exists public.food_entries_user_consumed_idx;
create index if not exists food_entries_user_consumed_meal_idx
  on public.food_entries (user_id, consumed_at desc, meal_type);
