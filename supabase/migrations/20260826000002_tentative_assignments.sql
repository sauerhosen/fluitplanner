-- Tentative appointments: a planner can sketch an assignment weeks ahead
-- without committing to it, and without the umpire seeing it.
--
-- Tentative rows live in `assignments` alongside confirmed ones so the unique
-- (poll_id, match_id, umpire_id) constraint still keeps a cell in one state
-- and promoting is a single-row update. Everything umpire-facing must read
-- through `confirmed_assignments` instead of the table.

alter table public.assignments
  add column status text not null default 'confirmed';

alter table public.assignments
  add constraint assignments_status_check
  check (status in ('tentative', 'confirmed'));

create index idx_assignments_poll_status on public.assignments (poll_id, status);

-- Umpire-facing reads use the service role, so RLS cannot be the safety net.
-- This view is: forgetting the filter now takes renaming the relation.
create view public.confirmed_assignments
  with (security_invoker = true) as
  select * from public.assignments where status = 'confirmed';

grant select on public.confirmed_assignments to authenticated, service_role;
