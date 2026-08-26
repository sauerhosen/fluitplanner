-- Planner notes on umpires (e.g. "Y is father of a player",
-- "X not yet ready for this team level").
--
-- The note lives on organization_umpires, not on umpires, for two reasons:
--   1. `umpires` rows are shared between organizations via this roster table,
--      so a note belongs to the organization that wrote it, not to the umpire.
--   2. `umpires` is readable by `anon` (the public poll page looks umpires up
--      by email), while organization_umpires is authenticated + org-scoped.
--      Storing the note here keeps it out of reach of the umpires themselves.
alter table public.organization_umpires add column notes text;
