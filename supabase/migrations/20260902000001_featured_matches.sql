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
-- Permissive like its sibling policies on this table — tenant scoping is
-- enforced in the query (`organization_id = tenantId`) by every caller.
create policy "Authenticated users can update poll_matches"
  on public.poll_matches for update to authenticated
  using (true);
