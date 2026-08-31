-- Answer "would deleting this account violate a foreign key?" from the catalog.
--
-- GoTrue reports any database failure during a user delete as a generic
-- "Database error deleting user" with HTTP 500 — the underlying Postgres error
-- code never reaches the client. So the admin UI cannot tell a blocking
-- reference apart from a transient outage by inspecting the error, and has to
-- ask the database directly.
--
-- Driving this off pg_constraint rather than a hardcoded table list means new
-- tables that reference auth.users are covered the day they are added.
-- Constraints that cascade or null out on delete (every auth-internal one) do
-- not block, so only NO ACTION ('a') and RESTRICT ('r') are considered.

create or replace function public.auth_user_is_referenced(target_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  fk record;
  referenced boolean;
begin
  for fk in
    -- conkey and confkey line up positionally, so the ordinality is what pairs
    -- a referencing column with the auth.users column it points at. Without
    -- that pairing a composite foreign key would have every one of its columns
    -- compared against the uuid, including columns of another type.
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_catalog.pg_constraint c
    join pg_catalog.unnest(c.conkey) with ordinality as k(attnum, ord) on true
    join pg_catalog.unnest(c.confkey) with ordinality as fk_ref(attnum, ord)
      on fk_ref.ord = k.ord
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = k.attnum
    join pg_catalog.pg_attribute ref
      on ref.attrelid = c.confrelid and ref.attnum = fk_ref.attnum
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype in ('a', 'r')
      and ref.attname = 'id'
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %s where %I = $1)', fk.tbl, fk.col
    )
    into referenced
    using target_user;

    if referenced then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.auth_user_is_referenced(uuid) is
  'True when rows still reference this auth user through a foreign key that blocks deletion. Service role only — it reads across every table.';

-- security definer plus cross-table reads: keep this off the public API.
revoke execute on function public.auth_user_is_referenced(uuid) from public;
revoke execute on function public.auth_user_is_referenced(uuid) from anon;
revoke execute on function public.auth_user_is_referenced(uuid) from authenticated;
grant execute on function public.auth_user_is_referenced(uuid) to service_role;
