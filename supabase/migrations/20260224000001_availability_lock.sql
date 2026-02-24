-- Organization-level settings (1:1 with organizations, extensible for future settings)
CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  availability_lock_mode text NOT NULL DEFAULT 'warn'
    CHECK (availability_lock_mode IN ('warn', 'lock')),
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users in the org can read and write settings
CREATE POLICY "Tenant isolation for organization_settings"
  ON public.organization_settings FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Anon can read settings (needed for public poll page to determine lock mode)
CREATE POLICY "Anon can select organization_settings"
  ON public.organization_settings FOR SELECT TO anon
  USING (true);

-- Seed defaults for all existing organizations
INSERT INTO public.organization_settings (organization_id)
SELECT id FROM public.organizations
ON CONFLICT DO NOTHING;

-- Log table for when umpires override warnings (change availability despite being assigned)
CREATE TABLE IF NOT EXISTS public.availability_override_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.poll_slots(id) ON DELETE CASCADE,
  umpire_id uuid NOT NULL REFERENCES public.umpires(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  previous_response text NOT NULL CHECK (previous_response IN ('yes', 'if_need_be')),
  new_response text NOT NULL DEFAULT 'no' CHECK (new_response IN ('no')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_override_logs_org ON public.availability_override_logs (organization_id);
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

-- Anon can insert override logs (umpires submitting from public poll page)
CREATE POLICY "Anon can insert override logs"
  ON public.availability_override_logs FOR INSERT TO anon
  WITH CHECK (true);
