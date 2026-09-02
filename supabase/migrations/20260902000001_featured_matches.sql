-- Featured matches: let a planner reveal specific match details inside an
-- otherwise anonymous availability poll. A slot normally shows only its time
-- window; a featured match additionally shows "home – away" to umpires.
--
-- Note the contrast with matches.notes, which is internal only: these two
-- columns deliberately put match data on the unauthenticated /poll/<token>
-- page, so anything read for them must be column-allowlisted.

-- Per-poll flag — the source of truth for what a given poll reveals. Keeping
-- it on the junction means the same fixture can be featured in one poll and
-- stay anonymous in another.
alter table public.poll_matches
  add column featured boolean not null default false;

-- Per-match default, seeds poll_matches.featured when a match joins a poll.
alter table public.matches
  add column featured_by_default boolean not null default false;

-- Featured rows are a small minority of poll_matches, so a partial index keeps
-- the public poll lookup off a full scan without carrying every row.
create index idx_poll_matches_featured
  on public.poll_matches (poll_id)
  where featured;

-- poll_matches has only select/insert/delete policies: until now the junction
-- was only ever replaced wholesale, never updated in place. Featuring toggles
-- a column on an existing row, so without this the update matches no rows and
-- PostgREST reports success having changed nothing.
--
-- Scoped to the caller's own clubs, unlike this table's older policies. Those
-- are permissive (`using (true)`) and rely on the server action filtering by
-- organization_id, which is fine for writes whose effect stays internal. This
-- is the first write on the table that PUBLISHES: flipping `featured` reveals
-- team names on a poll's anonymous link. A permissive policy would let any
-- signed-in user of any club publish another club's fixtures straight through
-- PostgREST with the browser key, bypassing the server action entirely.
--
-- get_user_org_ids() is the existing SECURITY DEFINER helper from
-- 20260215000007, used here for the same reason: reading membership directly
-- inside a policy risks recursion.
create policy "Authenticated users can update poll_matches"
  on public.poll_matches for update to authenticated
  using (
    exists (
      select 1
      from public.polls p
      where p.id = poll_matches.poll_id
        and p.organization_id in (select public.get_user_org_ids())
    )
  );
