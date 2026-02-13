-- Stage 5: Allow authenticated users to insert/update availability_responses
-- (Previously only anon could insert/update, but authenticated users visiting
-- /poll/[token] while logged in need the same access.)

create policy "Authenticated users can insert availability_responses"
  on public.availability_responses for insert to authenticated
  with check (true);

create policy "Authenticated users can update availability_responses"
  on public.availability_responses for update to authenticated
  using (true);
