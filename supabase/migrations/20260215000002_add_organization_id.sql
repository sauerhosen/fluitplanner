-- Add nullable organization_id to existing tables
alter table public.matches
  add column organization_id uuid references public.organizations;

alter table public.polls
  add column organization_id uuid references public.organizations;

alter table public.managed_teams
  add column organization_id uuid references public.organizations;

alter table public.assignments
  add column organization_id uuid references public.organizations;

alter table public.verification_codes
  add column organization_id uuid references public.organizations;

-- Indexes for the new columns
create index idx_matches_org on public.matches (organization_id);
create index idx_polls_org on public.polls (organization_id);
create index idx_managed_teams_org on public.managed_teams (organization_id);
create index idx_assignments_org on public.assignments (organization_id);
