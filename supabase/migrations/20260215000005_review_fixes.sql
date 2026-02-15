-- Fix verification_codes: add tenant isolation policy
drop policy if exists "Authenticated users can view verification codes" on public.verification_codes;
create policy "Tenant isolation for verification_codes"
  on public.verification_codes for all to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

-- Fix umpires: restrict to org-scoped access
drop policy if exists "Authenticated users can select umpires" on public.umpires;
drop policy if exists "Authenticated users can insert umpires" on public.umpires;
drop policy if exists "Authenticated users can update umpires" on public.umpires;
drop policy if exists "Authenticated users can delete umpires" on public.umpires;

create policy "Users can view umpires in their organizations"
  on public.umpires for select to authenticated
  using (
    id in (
      select umpire_id from public.organization_umpires
      where organization_id in (
        select organization_id from public.organization_members
        where user_id = auth.uid()
      )
    )
  );

-- Allow INSERT for any authenticated user (the org link is what matters)
create policy "Authenticated users can insert umpires"
  on public.umpires for insert to authenticated
  with check (true);

-- UPDATE/DELETE restricted to umpires in user's orgs
create policy "Users can update umpires in their organizations"
  on public.umpires for update to authenticated
  using (
    id in (
      select umpire_id from public.organization_umpires
      where organization_id in (
        select organization_id from public.organization_members
        where user_id = auth.uid()
      )
    )
  );

create policy "Users can delete umpires in their organizations"
  on public.umpires for delete to authenticated
  using (
    id in (
      select umpire_id from public.organization_umpires
      where organization_id in (
        select organization_id from public.organization_members
        where user_id = auth.uid()
      )
    )
  );

-- Allow anon to read organization id/slug (needed for middleware tenant resolution)
create policy "Anyone can view active organizations"
  on public.organizations for select to anon
  using (is_active = true);
