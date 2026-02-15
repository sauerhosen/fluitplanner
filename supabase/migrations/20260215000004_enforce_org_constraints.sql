-- Verify no NULLs remain (will fail if backfill was incomplete)
do $$
begin
  if exists (select 1 from public.matches where organization_id is null) then
    raise exception 'matches table has NULL organization_id values';
  end if;
  if exists (select 1 from public.polls where organization_id is null) then
    raise exception 'polls table has NULL organization_id values';
  end if;
  if exists (select 1 from public.managed_teams where organization_id is null) then
    raise exception 'managed_teams table has NULL organization_id values';
  end if;
  if exists (select 1 from public.assignments where organization_id is null) then
    raise exception 'assignments table has NULL organization_id values';
  end if;
  if exists (select 1 from public.verification_codes where organization_id is null) then
    raise exception 'verification_codes table has NULL organization_id values';
  end if;
end $$;

-- Make organization_id NOT NULL
alter table public.matches alter column organization_id set not null;
alter table public.polls alter column organization_id set not null;
alter table public.managed_teams alter column organization_id set not null;
alter table public.assignments alter column organization_id set not null;
alter table public.verification_codes alter column organization_id set not null;

-- Update match natural key constraint
-- Drop old constraint and create new one with organization_id
alter table public.matches drop constraint if exists matches_date_home_team_away_team_created_by_key;
alter table public.matches add constraint matches_date_home_team_away_team_org_key
  unique (date, home_team, away_team, organization_id);

-- Update RLS policies for tenant isolation
-- Matches: authenticated users can only access their org's matches
drop policy if exists "Authenticated users can CRUD own matches" on public.matches;
create policy "Tenant isolation for matches"
  on public.matches for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Polls: authenticated users can only access their org's polls
drop policy if exists "Authenticated users can CRUD own polls" on public.polls;
create policy "Tenant isolation for polls"
  on public.polls for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Managed teams: tenant isolation
drop policy if exists "Authenticated users can CRUD own managed teams" on public.managed_teams;
create policy "Tenant isolation for managed_teams"
  on public.managed_teams for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Assignments: tenant isolation
drop policy if exists "Only poll creator can insert assignments" on public.assignments;
drop policy if exists "Only poll creator can delete assignments" on public.assignments;
create policy "Tenant isolation for assignments"
  on public.assignments for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Keep anon policies for public poll access (token-based, unchanged)
