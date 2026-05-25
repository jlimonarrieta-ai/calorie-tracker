-- Migration 20260525: goals + onboarding profile fields
-- Adds the demographic + training inputs needed to compute Mifflin-St Jeor
-- targets, the per-macro targets themselves, and an `onboarded_at` flag the
-- client uses to gate first-run state.
--
-- All columns are nullable so existing pre-onboarding profile rows remain
-- valid; the client treats `onboarded_at IS NULL` as "needs onboarding".
-- `target_kg_per_week` is signed: negative = lose, positive = gain,
-- 0 or NULL = maintain.

alter table public.profiles
  add column if not exists sex text
    check (sex in ('male','female','other')),
  add column if not exists age_years int
    check (age_years > 0 and age_years < 120),
  add column if not exists height_cm numeric
    check (height_cm > 0 and height_cm < 300),
  add column if not exists current_weight_kg numeric
    check (current_weight_kg > 0 and current_weight_kg < 500),
  add column if not exists activity_level text
    check (activity_level in ('sedentary','light','moderate','active','very_active')),
  add column if not exists target_kg_per_week numeric
    check (target_kg_per_week >= -2 and target_kg_per_week <= 2),
  add column if not exists protein_g_target numeric
    check (protein_g_target >= 0),
  add column if not exists carbs_g_target numeric
    check (carbs_g_target >= 0),
  add column if not exists fat_g_target numeric
    check (fat_g_target >= 0),
  add column if not exists onboarded_at timestamptz;
