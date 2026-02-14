-- Allow anonymous users to insert verification codes (needed for poll email verification)
create policy "Anyone can insert verification codes"
  on public.verification_codes for insert
  to anon
  with check (true);

-- Allow anonymous users to select verification codes (needed for code/magic link verification)
create policy "Anyone can select verification codes"
  on public.verification_codes for select
  to anon
  using (true);

-- Allow anonymous users to update verification codes (needed for attempt tracking)
create policy "Anyone can update verification codes"
  on public.verification_codes for update
  to anon
  using (true)
  with check (true);

-- Allow anonymous users to delete verification codes (needed for cleanup)
create policy "Anyone can delete verification codes"
  on public.verification_codes for delete
  to anon
  using (true);
