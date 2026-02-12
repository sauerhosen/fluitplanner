-- Stage 1: Row Level Security policies

-- Enable RLS on all tables
alter table public.matches enable row level security;
alter table public.polls enable row level security;
alter table public.poll_matches enable row level security;
alter table public.poll_slots enable row level security;
alter table public.availability_responses enable row level security;

-- matches: authenticated users only
create policy "Authenticated users can select matches"
  on public.matches for select to authenticated
  using (true);

create policy "Authenticated users can insert matches"
  on public.matches for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update matches"
  on public.matches for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete matches"
  on public.matches for delete to authenticated
  using (auth.uid() = created_by);

-- polls: authenticated can CRUD, anon can select (token-filtered at query level)
create policy "Authenticated users can select polls"
  on public.polls for select to authenticated
  using (true);

create policy "Anon can select polls"
  on public.polls for select to anon
  using (true);

create policy "Authenticated users can insert polls"
  on public.polls for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update polls"
  on public.polls for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete polls"
  on public.polls for delete to authenticated
  using (auth.uid() = created_by);

-- poll_matches: authenticated can manage, anon can select
create policy "Authenticated users can select poll_matches"
  on public.poll_matches for select to authenticated
  using (true);

create policy "Anon can select poll_matches"
  on public.poll_matches for select to anon
  using (true);

create policy "Authenticated users can insert poll_matches"
  on public.poll_matches for insert to authenticated
  with check (true);

create policy "Authenticated users can delete poll_matches"
  on public.poll_matches for delete to authenticated
  using (true);

-- poll_slots: authenticated can manage, anon can select
create policy "Authenticated users can select poll_slots"
  on public.poll_slots for select to authenticated
  using (true);

create policy "Anon can select poll_slots"
  on public.poll_slots for select to anon
  using (true);

create policy "Authenticated users can insert poll_slots"
  on public.poll_slots for insert to authenticated
  with check (true);

create policy "Authenticated users can delete poll_slots"
  on public.poll_slots for delete to authenticated
  using (true);

-- availability_responses: authenticated can select/delete, anon can select/insert/update
create policy "Authenticated users can select availability_responses"
  on public.availability_responses for select to authenticated
  using (true);

create policy "Anon can select availability_responses"
  on public.availability_responses for select to anon
  using (true);

create policy "Anon can insert availability_responses"
  on public.availability_responses for insert to anon
  with check (true);

create policy "Anon can update availability_responses"
  on public.availability_responses for update to anon
  using (true);

create policy "Authenticated users can delete availability_responses"
  on public.availability_responses for delete to authenticated
  using (true);
