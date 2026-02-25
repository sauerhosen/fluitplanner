-- Organization-level settings (1:1 with organizations, extensible for future settings)
CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  availability_lock_mode text NOT NULL DEFAULT 'warn'
    CHECK (availability_lock_mode IN ('warn', 'lock')),
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users in the org can read settings
CREATE POLICY "Members can select organization_settings"
  ON public.organization_settings FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users in the org can update settings
CREATE POLICY "Members can update organization_settings"
  ON public.organization_settings FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Authenticated users in the org can insert settings (for initial seed)
CREATE POLICY "Members can insert organization_settings"
  ON public.organization_settings FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION public.update_organization_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_organization_settings_updated_at
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_organization_settings_updated_at();

-- Seed defaults for all existing organizations
INSERT INTO public.organization_settings (organization_id)
SELECT id FROM public.organizations
ON CONFLICT DO NOTHING;

-- Log table for when umpires override warnings or are blocked from changing availability.
-- Foreign keys use SET NULL to preserve audit trail when referenced entities are deleted.
CREATE TABLE IF NOT EXISTS public.availability_override_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid REFERENCES public.polls(id) ON DELETE SET NULL,
  slot_id uuid REFERENCES public.poll_slots(id) ON DELETE SET NULL,
  umpire_id uuid REFERENCES public.umpires(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  previous_response text NOT NULL CHECK (previous_response IN ('yes', 'if_need_be')),
  new_response text NOT NULL DEFAULT 'no' CHECK (new_response IN ('no')),
  policy text NOT NULL DEFAULT 'warn' CHECK (policy IN ('warn', 'lock')),
  outcome text NOT NULL DEFAULT 'confirmed' CHECK (outcome IN ('confirmed', 'blocked')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_override_logs_poll ON public.availability_override_logs (poll_id);
CREATE INDEX idx_override_logs_recent ON public.availability_override_logs (organization_id, created_at DESC);

ALTER TABLE public.availability_override_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users in the org can read override logs
CREATE POLICY "Tenant isolation for availability_override_logs"
  ON public.availability_override_logs FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- No anon policies: all override log inserts go through the service role client
-- which bypasses RLS, so no anon INSERT policy is needed.
