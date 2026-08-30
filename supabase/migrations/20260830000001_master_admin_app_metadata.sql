-- Move the master admin flag from user_metadata to app_metadata.
--
-- `user_metadata` is writable by the user it belongs to (auth.updateUser), so a
-- flag stored there is self-assignable and cannot be trusted as a permission.
-- `app_metadata` is only writable with the service role key, which is exactly
-- the property this flag needs. The invite flow already uses app_metadata for
-- `invited_to_org` for the same reason.

-- 1. Copy the flag into app_metadata for every user who currently has it.
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_master_admin', true)
where raw_user_meta_data ->> 'is_master_admin' = 'true';

-- 2. Drop it from user_metadata so the old (spoofable) location stops being read
--    anywhere. Removes self-assigned values too — they never conferred access
--    once the policies below are in place.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'is_master_admin'
where raw_user_meta_data ? 'is_master_admin';

-- 3. Single source of truth for the check, so future policies don't re-spell it.
create or replace function public.is_master_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_master_admin')::boolean,
    false
  );
$$;

comment on function public.is_master_admin() is
  'True when the caller''s JWT carries app_metadata.is_master_admin. app_metadata is service-role-writable only, so this is safe to use in RLS policies.';

-- 4. Repoint the two policies that read the flag straight out of the JWT.
drop policy if exists "Master admins can manage all organizations" on public.organizations;

create policy "Master admins can manage all organizations"
  on public.organizations for all to authenticated
  using (public.is_master_admin());

drop policy if exists "Master admins can manage all members" on public.organization_members;

create policy "Master admins can manage all members"
  on public.organization_members for all to authenticated
  using (public.is_master_admin());
