-- OAuth 2.0 authorization server state for the MCP server (/api/mcp).
--
-- Fluitplanner acts as its own authorization server so MCP clients that
-- require OAuth (claude.ai custom connectors) can connect: clients register
-- via Dynamic Client Registration or identify themselves with a Client ID
-- Metadata Document URL (CIMD), the planner approves access to one club on
-- the consent page, and the client exchanges the code (PKCE, S256 only) for
-- bearer tokens that the MCP route verifies like personal access tokens.
--
-- All three tables are service-role only (RLS enabled, no policies): every
-- read and write goes through the OAuth route handlers.

create table public.oauth_clients (
  -- DCR clients get a generated "fpd_…" id; CIMD clients use their HTTPS
  -- metadata URL as the id and this row caches the fetched document.
  client_id text primary key,
  kind text not null check (kind in ('dcr', 'cimd')),
  client_name text,
  client_uri text,
  logo_uri text,
  redirect_uris text[] not null,
  -- Raw registration request / CIMD document, for audit and re-validation.
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text,
  resource text,
  expires_at timestamptz not null,
  -- Single use: consuming a code sets used_at atomically.
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  scope text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_tokens enable row level security;

create index oauth_codes_expiry_idx on public.oauth_authorization_codes (expires_at);
create index oauth_tokens_user_org_idx on public.oauth_tokens (user_id, organization_id);
