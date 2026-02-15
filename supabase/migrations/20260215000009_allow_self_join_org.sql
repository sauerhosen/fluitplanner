-- Allow authenticated users to add themselves to an organization.
-- This enables the middleware auto-join for cookie/query-param tenant fallback
-- (used in dev/preview environments).
-- Users can only insert their own user_id, not impersonate others.
create policy "Users can join organizations"
  on public.organization_members for insert to authenticated
  with check (user_id = auth.uid());
