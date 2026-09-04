-- Viewer role: strictly read-only club membership.
--
-- organization_members.role has allowed 'viewer' since multi-tenancy landed,
-- but almost every tenant table still carried a members-can-do-anything
-- policy ("Tenant isolation for …" FOR ALL), plus leftovers from before
-- multi-tenancy that were never dropped: the stage-1 "Authenticated users can
-- select matches" / "… assignments" policies were USING (true), which let any
-- signed-in user of any club read every club's matches and assignments
-- straight through PostgREST with the browser key. This migration rebuilds
-- the authenticated policies on tenant-owned tables into one explicit shape:
--
--   select  → any member of the club        (get_user_org_ids)
--   write   → planners of the club only     (get_user_planner_org_ids)
--
-- Deliberately untouched — the anonymous /poll/<token> surface:
--   * anon + authenticated SELECT on polls / poll_matches / poll_slots /
--     availability_responses stay USING (true): the public poll page reads
--     them with the caller's own client and filters by token in the query.
--   * anon + authenticated INSERT/UPDATE on availability_responses and INSERT
--     on umpires stay open for the same reason (a signed-in umpire filling in
--     a poll runs as `authenticated`). Restricting authenticated below anon
--     would only break logged-in umpires without protecting anything.
-- Tightening that surface means moving the public poll flow onto the service
-- client first; it is a separate change.

-- ---------------------------------------------------------------------------
-- Helper: the caller's planner clubs. SECURITY DEFINER for the same reason as
-- get_user_org_ids() (20260215000007): a policy that reads
-- organization_members from inside organization_members recurses.
-- ---------------------------------------------------------------------------
create or replace function public.get_user_planner_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid() and role = 'planner';
$$;

comment on function public.get_user_planner_org_ids() is
  'Organizations in which the caller holds the planner role. Used by RLS write policies; viewers get an empty set.';

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can select matches" on public.matches;
drop policy if exists "Authenticated users can insert matches" on public.matches;
drop policy if exists "Authenticated users can update matches" on public.matches;
drop policy if exists "Authenticated users can delete matches" on public.matches;
drop policy if exists "Tenant isolation for matches" on public.matches;

create policy "Members can select matches"
  on public.matches for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

create policy "Planners can insert matches"
  on public.matches for insert to authenticated
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can update matches"
  on public.matches for update to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()))
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can delete matches"
  on public.matches for delete to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()));

-- ---------------------------------------------------------------------------
-- polls (select policies kept: see header)
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can insert polls" on public.polls;
drop policy if exists "Authenticated users can update polls" on public.polls;
drop policy if exists "Authenticated users can delete polls" on public.polls;
drop policy if exists "Tenant isolation for polls" on public.polls;

create policy "Planners can insert polls"
  on public.polls for insert to authenticated
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can update polls"
  on public.polls for update to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()))
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can delete polls"
  on public.polls for delete to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()));

-- ---------------------------------------------------------------------------
-- poll_matches / poll_slots: scoped through the owning poll
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can insert poll_matches" on public.poll_matches;
drop policy if exists "Authenticated users can update poll_matches" on public.poll_matches;
drop policy if exists "Authenticated users can delete poll_matches" on public.poll_matches;

create policy "Planners can insert poll_matches"
  on public.poll_matches for insert to authenticated
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_matches.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

create policy "Planners can update poll_matches"
  on public.poll_matches for update to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_matches.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

create policy "Planners can delete poll_matches"
  on public.poll_matches for delete to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_matches.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

drop policy if exists "Authenticated users can insert poll_slots" on public.poll_slots;
drop policy if exists "Authenticated users can delete poll_slots" on public.poll_slots;

create policy "Planners can insert poll_slots"
  on public.poll_slots for insert to authenticated
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_slots.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

create policy "Planners can delete poll_slots"
  on public.poll_slots for delete to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_slots.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- availability_responses: only DELETE is planner-side (clearing an umpire's
-- answer from the response grid). Insert/update stay open — see header.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can delete availability_responses" on public.availability_responses;

create policy "Planners can delete availability_responses"
  on public.availability_responses for delete to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = availability_responses.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can select assignments" on public.assignments;
drop policy if exists "Authenticated users can insert assignments" on public.assignments;
drop policy if exists "Authenticated users can delete assignments" on public.assignments;
drop policy if exists "Tenant isolation for assignments" on public.assignments;

create policy "Members can select assignments"
  on public.assignments for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

create policy "Planners can insert assignments"
  on public.assignments for insert to authenticated
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can update assignments"
  on public.assignments for update to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()))
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can delete assignments"
  on public.assignments for delete to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()));

-- ---------------------------------------------------------------------------
-- managed_teams
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can select managed_teams" on public.managed_teams;
drop policy if exists "Authenticated users can insert managed_teams" on public.managed_teams;
drop policy if exists "Authenticated users can update managed_teams" on public.managed_teams;
drop policy if exists "Authenticated users can delete managed_teams" on public.managed_teams;
drop policy if exists "Tenant isolation for managed_teams" on public.managed_teams;

create policy "Members can select managed_teams"
  on public.managed_teams for select to authenticated
  using (organization_id in (select public.get_user_org_ids()));

create policy "Planners can insert managed_teams"
  on public.managed_teams for insert to authenticated
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can update managed_teams"
  on public.managed_teams for update to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()))
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can delete managed_teams"
  on public.managed_teams for delete to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()));

-- ---------------------------------------------------------------------------
-- verification_codes: every read and write goes through the service role
-- (lib/actions/verification.ts), so no authenticated policy is needed at
-- all. The old FOR ALL policy let any club member read `magic_token` in
-- plaintext through PostgREST and then act as that umpire via
-- verifyMagicLink(); it is dropped without replacement.
-- ---------------------------------------------------------------------------
drop policy if exists "Tenant isolation for verification_codes" on public.verification_codes;

-- ---------------------------------------------------------------------------
-- umpires: rows are shared across clubs through organization_umpires, so a
-- planner may edit an umpire who is on their roster. Select/insert stay open
-- for the public poll flow (see header and 20260215000008).
-- ---------------------------------------------------------------------------
drop policy if exists "Users can update umpires in their organizations" on public.umpires;
drop policy if exists "Users can delete umpires in their organizations" on public.umpires;

create policy "Planners can update umpires in their organizations"
  on public.umpires for update to authenticated
  using (
    id in (
      select umpire_id from public.organization_umpires
      where organization_id in (select public.get_user_planner_org_ids())
    )
  );

create policy "Planners can delete umpires in their organizations"
  on public.umpires for delete to authenticated
  using (
    id in (
      select umpire_id from public.organization_umpires
      where organization_id in (select public.get_user_planner_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- organization_settings
-- ---------------------------------------------------------------------------
drop policy if exists "Members can insert organization_settings" on public.organization_settings;
drop policy if exists "Members can update organization_settings" on public.organization_settings;

create policy "Planners can insert organization_settings"
  on public.organization_settings for insert to authenticated
  with check (organization_id in (select public.get_user_planner_org_ids()));

create policy "Planners can update organization_settings"
  on public.organization_settings for update to authenticated
  using (organization_id in (select public.get_user_planner_org_ids()))
  with check (organization_id in (select public.get_user_planner_org_ids()));
