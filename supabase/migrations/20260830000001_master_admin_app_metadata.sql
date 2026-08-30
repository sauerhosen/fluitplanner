-- Move the master admin flag from user_metadata to app_metadata.
--
-- `user_metadata` is writable by the user it belongs to (auth.updateUser), so a
-- flag stored there is self-assignable and cannot be trusted as a permission.
-- `app_metadata` is only writable with the service role key, which is exactly
-- the property this flag needs. The invite flow already uses app_metadata for
-- `invited_to_org` for the same reason.

-- 1. Promote the known master admins into app_metadata.
--
--    Deliberately an allow list rather than "everyone who currently has the
--    flag": the old location is user-writable, so promoting on its say-so would
--    turn a self-assigned flag into a real one. Add an address here only after
--    confirming it is an intended master admin.
--
--    To audit a database before applying this:
--      select id, email, created_at from auth.users
--      where raw_user_meta_data ->> 'is_master_admin' = 'true';
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_master_admin', true)
where email in ('okke@palmboom.com')
  and raw_user_meta_data ->> 'is_master_admin' = 'true';

-- 2. Drop the flag from user_metadata for EVERYONE, so any self-assigned value
--    is discarded rather than carried forward. Nothing reads this location once
--    the policies below are in place.
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
