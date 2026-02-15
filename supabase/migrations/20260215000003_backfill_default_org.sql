-- Create default organization for existing data
-- The created_by should be set to the existing user's ID.
-- We grab the first authenticated user as the owner.
do $$
declare
  default_org_id uuid := gen_random_uuid();
  first_user_id uuid;
begin
  -- Find the first user who has created data
  select created_by into first_user_id from public.matches limit 1;

  -- If no matches exist, try polls
  if first_user_id is null then
    select created_by into first_user_id from public.polls limit 1;
  end if;

  -- If still no user, skip backfill (fresh install)
  if first_user_id is null then
    return;
  end if;

  -- Create default org
  insert into public.organizations (id, name, slug, created_by)
  values (default_org_id, 'Default', 'default', first_user_id);

  -- Add user as planner
  insert into public.organization_members (organization_id, user_id, role)
  values (default_org_id, first_user_id, 'planner');

  -- Backfill organization_id on all tables
  update public.matches set organization_id = default_org_id where organization_id is null;
  update public.polls set organization_id = default_org_id where organization_id is null;
  update public.managed_teams set organization_id = default_org_id where organization_id is null;
  update public.assignments set organization_id = default_org_id where organization_id is null;
  update public.verification_codes set organization_id = default_org_id where organization_id is null;

  -- Link all existing umpires to default org
  insert into public.organization_umpires (organization_id, umpire_id)
  select default_org_id, id from public.umpires;
end $$;
