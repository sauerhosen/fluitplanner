-- Personal access tokens for the MCP server (/api/mcp).
--
-- A token is bound to one user in one organization: the MCP conversation is
-- always scoped to exactly the club the token was created for, mirroring the
-- web UI's tenant isolation. Only the SHA-256 hash is stored; the plaintext
-- token is shown once at creation and never again.
--
-- The planner role is NOT recorded on the token — it is re-checked against
-- organization_members on every MCP request, so demoting or removing a member
-- takes effect immediately.
create table public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  -- First characters of the plaintext token, kept so the owner can tell
  -- tokens apart in the UI without the plaintext being recoverable.
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.mcp_tokens enable row level security;

-- Owners manage only their own tokens, and only for organizations where they
-- hold the planner role. Verification at request time uses the service role
-- and bypasses RLS.
create policy "Users manage own mcp tokens"
  on public.mcp_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid() and role = 'planner'
    )
  );

create index mcp_tokens_user_org_idx on public.mcp_tokens (user_id, organization_id);
