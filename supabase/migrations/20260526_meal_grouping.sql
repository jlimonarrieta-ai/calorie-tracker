-- CalTrack: meal grouping
-- Adds a meal_type bucket to every food entry so the Today screen can group
-- breakfast / lunch / dinner / snack and so future features (macros per meal,
-- copy-day) can target a specific meal.
--
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- Each statement below must be executed separately when using
-- CONCURRENTLY (Postgres forbids it inside an explicit transaction block).

-- text + CHECK keeps the same shape as `source` (init migration). Existing
-- rows get the default 'snack' so they remain visible somewhere in the UI;
-- users can re-bucket them via the edit flow when it ships.
-- On Postgres 11+ this is metadata-only and does not rewrite the table.
alter table public.food_entries
  add column if not exists meal_type text not null default 'snack'
  check (meal_type in ('breakfast','lunch','dinner','snack'));

-- Build the replacement index first, concurrently, so production never has a
-- window without a covering index on the Today-query access path and writes
-- are not blocked while the index is built. CONCURRENTLY cannot run inside
-- a transaction — execute this statement on its own.
create index concurrently if not exists food_entries_user_consumed_meal_idx
  on public.food_entries (user_id, consumed_at desc, meal_type);

-- The original (user_id, consumed_at desc) index is now redundant: the new
-- index above starts with the same prefix and adds meal_type as a trailing
-- column. Drop it only after the replacement is online.
drop index if exists public.food_entries_user_consumed_idx;
