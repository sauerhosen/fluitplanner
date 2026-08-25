-- Planner notes on matches (e.g. "Umpire X would like to be assigned",
-- "Don't assign Y"). Internal only: never surfaced on the public poll page.
alter table public.matches add column notes text;
