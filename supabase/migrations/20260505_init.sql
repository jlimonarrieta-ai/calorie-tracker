-- CalTrack initial schema
-- Run this in Supabase Dashboard → SQL Editor → New query

-- Profiles: one row per auth user
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  daily_calorie_goal int,
  created_at timestamptz not null default now()
);

-- Food entries: every meal/snack logged
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  calories numeric not null check (calories >= 0),
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  serving_grams numeric,
  consumed_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','openfoodfacts','usda','photo')),
  external_id text,
  created_at timestamptz not null default now()
);

create index if not exists food_entries_user_consumed_idx
  on public.food_entries (user_id, consumed_at desc);

-- Shares: User A allows User B to read their diary
create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_id)
);

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.food_entries enable row level security;
alter table public.shares enable row level security;

-- profiles: users can read/update only their own row
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- food_entries: owner full access, plus shared viewers can read
drop policy if exists "food_entries_owner_all" on public.food_entries;
create policy "food_entries_owner_all" on public.food_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "food_entries_shared_select" on public.food_entries;
create policy "food_entries_shared_select" on public.food_entries
  for select using (
    exists (
      select 1 from public.shares s
      where s.owner_id = food_entries.user_id
        and s.viewer_id = auth.uid()
    )
  );

-- shares: owner can manage; viewer can see who shared with them
drop policy if exists "shares_owner_all" on public.shares;
create policy "shares_owner_all" on public.shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "shares_viewer_select" on public.shares;
create policy "shares_viewer_select" on public.shares
  for select using (auth.uid() = viewer_id);
