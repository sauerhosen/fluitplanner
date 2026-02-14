-- Remove permissive anon and authenticated RLS policies on verification_codes.
-- All verification operations now use the service role client which bypasses RLS.
-- Only the authenticated SELECT policy remains for planner debugging.

drop policy if exists "Anyone can insert verification codes" on public.verification_codes;
drop policy if exists "Anyone can select verification codes" on public.verification_codes;
drop policy if exists "Anyone can update verification codes" on public.verification_codes;
drop policy if exists "Anyone can delete verification codes" on public.verification_codes;
drop policy if exists "Authenticated users can insert verification codes" on public.verification_codes;
drop policy if exists "Authenticated users can update verification codes" on public.verification_codes;
drop policy if exists "Authenticated users can delete verification codes" on public.verification_codes;
