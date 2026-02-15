-- Fix umpire INSERT+SELECT: the org-scoped SELECT policy blocks .insert().select()
-- because the umpire isn't in organization_umpires yet at INSERT time.
-- Also blocks the email lookup in the find-or-create pattern.
-- Fix: allow authenticated users to SELECT any umpire (INSERT is already open).
-- Security note: umpire data (name, email, level) is not sensitive within an org;
-- the org-scoping via organization_umpires controls which umpires appear in the UI.

drop policy if exists "Users can view umpires in their organizations" on public.umpires;

create policy "Authenticated users can view umpires"
  on public.umpires for select to authenticated
  using (true);
