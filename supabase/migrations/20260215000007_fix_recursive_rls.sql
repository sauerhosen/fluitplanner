-- Fix infinite recursion in organization_members RLS policy.
-- The previous policy self-referenced organization_members, causing recursion.
-- Fix: use a SECURITY DEFINER function to get user's org IDs without RLS.

create or replace function public.get_user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid();
$$;

-- Fix organization_members: use function instead of self-referencing subquery
drop policy if exists "Users can view members of their organizations" on public.organization_members;

create policy "Users can view members of their organizations"
  on public.organization_members for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

-- Fix organizations: the "Users can view their organizations" policy also
-- referenced organization_members which could trigger the same recursion.
drop policy if exists "Users can view their organizations" on public.organizations;

create policy "Users can view their organizations"
  on public.organizations for select to authenticated
  using (id in (select public.get_user_org_ids()));

-- The broad "active orgs" policy is still needed for middleware tenant resolution
-- (user may not be a member yet when the middleware looks up the org by slug)
drop policy if exists "Authenticated users can view active organizations" on public.organizations;
create policy "Authenticated users can view active organizations"
  on public.organizations for select to authenticated
  using (is_active = true);

-- Also fix organization_umpires policies to use the helper function
drop policy if exists "Users can view umpires in their organizations" on public.organization_umpires;
create policy "Users can view umpires in their organizations"
  on public.organization_umpires for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

drop policy if exists "Planners can manage umpires in their organizations" on public.organization_umpires;
create policy "Planners can manage umpires in their organizations"
  on public.organization_umpires for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );
