-- Merge two umpire records into one.
--
-- Planners end up with a duplicate umpire when someone mistypes their email on
-- a poll: the address is the identity everywhere (`umpires.email` is unique and
-- the public poll page looks umpires up by it), so one typo creates a second
-- person carrying their own availability, appointments and roster note.
--
-- The merge lives in the database rather than in a sequence of client calls
-- because it rewrites five tables and deletes rows: a half-applied merge would
-- strand availability on an umpire that no longer exists. One function call is
-- one transaction.
--
-- Conflict rules, for the rows where both umpires hold an answer for the same
-- cell (they are one person, so only one answer can survive):
--   * availability: the most recently updated answer wins — the same person's
--     latest intent, whichever record they happened to use at the time.
--   * assignments: a confirmed appointment always beats a tentative one, and
--     ties break on the most recent. Silently downgrading a confirmed
--     appointment to a sketch would lose a commitment the planner made.

-- `assignments.umpire_id` carries a cascading foreign key but no index of its
-- own, so every lookup by umpire — the merge's own rewrite, the preview count
-- behind the confirm step, and the cascade when an umpire row is deleted —
-- scans the whole table.
--
-- Built without CONCURRENTLY on purpose. The CLI does support it (it runs such
-- statements outside its transaction batch), but the plain build blocks writes
-- to a table of a few hundred rows for the moment it takes, while a concurrent
-- build that fails leaves an INVALID index behind that the IF NOT EXISTS here
-- would then skip over for good — unused, and silently never rebuilt.
create index if not exists idx_assignments_umpire_id
  on public.assignments (umpire_id);

create or replace function public.merge_umpires(
  p_surviving_id uuid,
  p_disappearing_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_surviving public.umpires%rowtype;
  v_disappearing public.umpires%rowtype;
  v_responses_dropped integer := 0;
  v_responses_moved integer := 0;
  v_assignments_dropped integer := 0;
  v_assignments_moved integer := 0;
begin
  if p_surviving_id is null or p_disappearing_id is null then
    raise exception 'Both umpires are required' using errcode = '22023';
  end if;

  if p_surviving_id = p_disappearing_id then
    raise exception 'Cannot merge an umpire into themselves' using errcode = '22023';
  end if;

  -- SECURITY DEFINER bypasses RLS, so every check the policies would have made
  -- has to be made here instead. Merging is destructive, so it is planner-only
  -- even though a viewer can read both records.
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role = 'planner'
  ) then
    raise exception 'Only planners of this organization can merge umpires'
      using errcode = '42501';
  end if;

  -- Lock both rows in a fixed order before reading them: two planners merging
  -- the same pair in opposite directions serialize here instead of deadlocking
  -- or each deleting the other's survivor.
  perform 1 from public.umpires
    where id in (p_surviving_id, p_disappearing_id)
    order by id
    for update;

  select * into v_surviving from public.umpires where id = p_surviving_id;
  select * into v_disappearing from public.umpires where id = p_disappearing_id;

  if v_surviving.id is null or v_disappearing.id is null then
    raise exception 'Umpire not found' using errcode = 'P0002';
  end if;

  -- Both must be on the caller's own roster. Without this a planner could name
  -- any umpire id in the system as the one to delete.
  if not exists (
    select 1 from public.organization_umpires
    where organization_id = p_organization_id and umpire_id = p_surviving_id
  ) or not exists (
    select 1 from public.organization_umpires
    where organization_id = p_organization_id and umpire_id = p_disappearing_id
  ) then
    raise exception 'Both umpires must be on this organization''s roster'
      using errcode = '42501';
  end if;

  ------------------------------------------------------------------
  -- Availability responses
  ------------------------------------------------------------------
  -- Where both answered the same slot of the same poll, drop the older answer.
  -- The id breaks ties so the choice is deterministic when two rows share an
  -- updated_at, and so exactly one of the pair matches the condition.
  delete from public.availability_responses ar
  where ar.umpire_id in (p_surviving_id, p_disappearing_id)
    and exists (
      select 1 from public.availability_responses other
      where other.poll_id = ar.poll_id
        and other.slot_id = ar.slot_id
        and other.umpire_id in (p_surviving_id, p_disappearing_id)
        and other.umpire_id <> ar.umpire_id
        and (other.updated_at, other.id) > (ar.updated_at, ar.id)
    );
  get diagnostics v_responses_dropped = row_count;

  update public.availability_responses
  set umpire_id = p_surviving_id
  where umpire_id = p_disappearing_id;
  get diagnostics v_responses_moved = row_count;

  -- participant_name is what the poll grid groups its rows by, so carried-over
  -- answers have to take the survivor's name or the same person keeps showing
  -- up twice. Rewriting the survivor's own rows too settles any name they had
  -- stored from before a rename.
  update public.availability_responses
  set participant_name = v_surviving.name
  where umpire_id = p_surviving_id
    and participant_name is distinct from v_surviving.name;

  ------------------------------------------------------------------
  -- Assignments (confirmed and tentative)
  ------------------------------------------------------------------
  delete from public.assignments a
  where a.umpire_id in (p_surviving_id, p_disappearing_id)
    and exists (
      select 1 from public.assignments other
      where other.poll_id = a.poll_id
        and other.match_id = a.match_id
        and other.umpire_id in (p_surviving_id, p_disappearing_id)
        and other.umpire_id <> a.umpire_id
        and (
          (other.status = 'confirmed')::int,
          other.created_at,
          other.id
        ) > ((a.status = 'confirmed')::int, a.created_at, a.id)
    );
  get diagnostics v_assignments_dropped = row_count;

  update public.assignments
  set umpire_id = p_surviving_id
  where umpire_id = p_disappearing_id;
  get diagnostics v_assignments_moved = row_count;

  ------------------------------------------------------------------
  -- Audit trail
  ------------------------------------------------------------------
  update public.availability_override_logs
  set umpire_id = p_surviving_id
  where umpire_id = p_disappearing_id;

  ------------------------------------------------------------------
  -- Roster membership and per-organization notes
  ------------------------------------------------------------------
  -- Where an organization rosters both, its note about the duplicate is
  -- appended to the one it keeps rather than dropped — it was written about
  -- this same person. Capped at MAX_NOTE_LENGTH (lib/domain/notes.ts) so the
  -- merged note stays editable in the note dialog afterwards.
  update public.organization_umpires s
  set notes = case
    when d.notes is null or btrim(d.notes) = '' then s.notes
    when s.notes is null or btrim(s.notes) = '' then d.notes
    when btrim(s.notes) = btrim(d.notes) then s.notes
    else left(s.notes || E'\n\n' || d.notes, 2000)
  end
  from public.organization_umpires d
  where s.umpire_id = p_surviving_id
    and d.umpire_id = p_disappearing_id
    and d.organization_id = s.organization_id;

  delete from public.organization_umpires d
  where d.umpire_id = p_disappearing_id
    and exists (
      select 1 from public.organization_umpires s
      where s.umpire_id = p_surviving_id
        and s.organization_id = d.organization_id
    );

  -- Organizations that only ever knew the duplicate keep their roster entry;
  -- it now points at the survivor.
  update public.organization_umpires
  set umpire_id = p_surviving_id
  where umpire_id = p_disappearing_id;

  ------------------------------------------------------------------
  -- The umpire record itself
  ------------------------------------------------------------------
  -- If the duplicate is the record the person actually verified against, that
  -- link is the thing worth keeping. auth_user_id is unique, so it has to be
  -- released before it can be claimed.
  if v_surviving.auth_user_id is null and v_disappearing.auth_user_id is not null then
    update public.umpires set auth_user_id = null where id = p_disappearing_id;
    update public.umpires set auth_user_id = v_disappearing.auth_user_id
      where id = p_surviving_id;
  end if;

  delete from public.umpires where id = p_disappearing_id;

  return jsonb_build_object(
    'surviving_id', p_surviving_id,
    'disappearing_id', p_disappearing_id,
    'responses_moved', v_responses_moved,
    'responses_dropped', v_responses_dropped,
    'assignments_moved', v_assignments_moved,
    'assignments_dropped', v_assignments_dropped
  );
end;
$$;

revoke all on function public.merge_umpires(uuid, uuid, uuid) from public, anon;
grant execute on function public.merge_umpires(uuid, uuid, uuid) to authenticated;
