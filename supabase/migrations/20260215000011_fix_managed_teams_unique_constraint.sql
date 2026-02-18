-- Fix managed_teams unique constraint: scope by organization instead of creator
-- Previously: unique (name, created_by) — prevented same team name across orgs
-- Now: unique (name, organization_id) — allows same name in different orgs
alter table public.managed_teams
  drop constraint if exists managed_teams_name_created_by_key;

alter table public.managed_teams
  add constraint managed_teams_name_organization_id_key
  unique (name, organization_id);
