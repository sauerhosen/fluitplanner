-- Allow authenticated users to insert verification codes
-- (needed when a logged-in planner visits a poll page and triggers email verification)
create policy "Authenticated users can insert verification codes"
  on public.verification_codes for insert
  to authenticated
  with check (true);

-- Allow authenticated users to update verification codes (attempt tracking)
create policy "Authenticated users can update verification codes"
  on public.verification_codes for update
  to authenticated
  using (true)
  with check (true);

-- Allow authenticated users to delete verification codes (cleanup)
create policy "Authenticated users can delete verification codes"
  on public.verification_codes for delete
  to authenticated
  using (true);
