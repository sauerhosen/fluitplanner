-- Hidden poll matches: let a planner collapse matches out of a poll's
-- assignment grid (e.g. fixtures the club does not umpire itself) and keep
-- them out of exports.
--
-- Per poll, on the junction, like `featured`: the same fixture can be hidden
-- in one poll and visible in another. It is a planner-side view flag only —
-- slots, the public poll page and umpires' answers are unaffected.
--
-- No new policy needed: "Planners can update poll_matches"
-- (20260903000001) already scopes updates to the caller's planner clubs.
alter table public.poll_matches
  add column hidden boolean not null default false;
