-- Verification codes for poll email verification
create table public.verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  magic_token text unique not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz default now() not null
);

-- Only one active code per email (enforced via partial unique index)
create unique index verification_codes_email_active
  on public.verification_codes (email)
  where expires_at > now();

-- Index for magic token lookups
create index verification_codes_magic_token_idx
  on public.verification_codes (magic_token);

-- RLS: deny all anonymous access (server actions use service role internally)
alter table public.verification_codes enable row level security;

-- Authenticated planners can view (useful for debugging, not required)
create policy "Authenticated users can view verification codes"
  on public.verification_codes for select
  to authenticated
  using (true);
