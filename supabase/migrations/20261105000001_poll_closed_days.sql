-- Closed poll days: a planner can close individual days of an open poll once
-- they have enough answers (or the day is planned). A closed day drops off the
-- public poll page and submitResponses refuses answers for its slots; the
-- planner keeps seeing it, with every answer already given, and can reopen it.
--
-- A day is the Europe/Amsterdam calendar date of a slot's start, so it
-- survives slots being regenerated when matches are added or removed.
create table public.poll_closed_days (
  poll_id uuid not null references public.polls(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, day)
);

alter table public.poll_closed_days enable row level security;

-- Readable like poll_slots: the anonymous /poll/<token> page filters slots by
-- it with the caller's own client (see 20260903000001's header).
create policy "Anyone can select poll_closed_days"
  on public.poll_closed_days for select to anon, authenticated
  using (true);

create policy "Planners can insert poll_closed_days"
  on public.poll_closed_days for insert to authenticated
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_closed_days.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

create policy "Planners can delete poll_closed_days"
  on public.poll_closed_days for delete to authenticated
  using (
    exists (
      select 1 from public.polls p
      where p.id = poll_closed_days.poll_id
        and p.organization_id in (select public.get_user_planner_org_ids())
    )
  );

grant select on public.poll_closed_days to anon;
grant select, insert, delete on public.poll_closed_days to authenticated;
grant all on public.poll_closed_days to service_role;
