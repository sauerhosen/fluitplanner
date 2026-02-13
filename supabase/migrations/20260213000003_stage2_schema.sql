-- Stage 2: Match management schema changes

-- Managed teams table
create table public.managed_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  required_level integer not null default 1 check (required_level in (1, 2, 3)),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null,
  unique (name, created_by)
);

create index idx_managed_teams_created_by on public.managed_teams (created_by);

-- Add columns to matches
alter table public.matches add column field text;
alter table public.matches add column required_level integer default 1 check (required_level in (1, 2, 3));

-- Make start_time nullable (some KNHB rows lack times)
alter table public.matches alter column start_time drop not null;

-- Natural key for upsert on re-import
alter table public.matches add constraint matches_unique_natural_key
  unique (date, home_team, away_team, created_by);

-- RLS for managed_teams
alter table public.managed_teams enable row level security;

create policy "Authenticated users can select managed_teams"
  on public.managed_teams for select to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can insert managed_teams"
  on public.managed_teams for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update managed_teams"
  on public.managed_teams for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete managed_teams"
  on public.managed_teams for delete to authenticated
  using (auth.uid() = created_by);
