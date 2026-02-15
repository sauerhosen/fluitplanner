-- Add missing organization_id index on verification_codes
-- (all other tables with organization_id already have this index)
create index if not exists idx_verification_codes_org
  on public.verification_codes (organization_id);
