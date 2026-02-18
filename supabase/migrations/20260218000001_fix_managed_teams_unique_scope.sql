-- Allow the same managed team name across different organizations.
-- Keep team names unique within a single organization.

alter table public.managed_teams
  drop constraint if exists managed_teams_name_created_by_key;

alter table public.managed_teams
  drop constraint if exists managed_teams_organization_id_name_key;

alter table public.managed_teams
  add constraint managed_teams_organization_id_name_key
  unique (organization_id, name);
