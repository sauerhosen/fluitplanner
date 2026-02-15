-- Allow authenticated users to read any active organization by slug.
-- The middleware needs to look up org by slug for tenant resolution,
-- even before the user is confirmed as a member of that org.
-- (The existing "Users can view their organizations" policy only allows
-- reading orgs the user is already a member of — chicken-and-egg problem.)
create policy "Authenticated users can view active organizations"
  on public.organizations for select to authenticated
  using (is_active = true);
