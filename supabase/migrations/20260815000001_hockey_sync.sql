-- Hockey.nl Match Center sync: device credentials, API cache, tracked teams,
-- per-org sync state, and sync-related columns on matches.

-- Single-row global anonymous device credential for the Match Center API.
-- Service-role only: RLS enabled with no policies (same approach as verification_codes).
CREATE TABLE IF NOT EXISTS public.hockey_device_credentials (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  device_uuid uuid NOT NULL,
  device_token text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.hockey_device_credentials ENABLE ROW LEVEL SECURITY;

-- Org-agnostic upstream response cache (serverless-safe: survives invocations).
-- Service-role only: RLS enabled with no policies.
CREATE TABLE IF NOT EXISTS public.hockey_api_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.hockey_api_cache ENABLE ROW LEVEL SECURITY;

-- Per-org tracked Match Center teams.
CREATE TABLE IF NOT EXISTS public.tracked_teams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  club_federation_reference_id text NOT NULL,
  club_name text NOT NULL,
  hockey_team_id integer NOT NULL,
  team_name text NOT NULL,
  hockey_type text,
  recent_poule_id integer,
  managed_team_id uuid REFERENCES public.managed_teams(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (organization_id, hockey_team_id)
);

CREATE INDEX idx_tracked_teams_org ON public.tracked_teams (organization_id);
CREATE INDEX idx_tracked_teams_managed_team ON public.tracked_teams (managed_team_id);
CREATE INDEX idx_tracked_teams_created_by ON public.tracked_teams (created_by);

ALTER TABLE public.tracked_teams ENABLE ROW LEVEL SECURITY;

-- Members can read; only planners can change tracking config.
CREATE POLICY "Members can select tracked_teams"
  ON public.tracked_teams FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Planners can insert tracked_teams"
  ON public.tracked_teams FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'planner'
    )
  );

CREATE POLICY "Planners can update tracked_teams"
  ON public.tracked_teams FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'planner'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'planner'
    )
  );

CREATE POLICY "Planners can delete tracked_teams"
  ON public.tracked_teams FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role = 'planner'
    )
  );

-- Per-org sync state (1:1 with organizations, mirrors organization_settings pattern).
CREATE TABLE IF NOT EXISTS public.hockey_sync_state (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_error text,
  last_inserted integer NOT NULL DEFAULT 0,
  last_updated integer NOT NULL DEFAULT 0,
  last_flagged integer NOT NULL DEFAULT 0,
  awaiting_time_count integer NOT NULL DEFAULT 0,
  -- Short-lived run lease: claimed by advancing it into the future, released
  -- by resetting to now, self-expiring if a run crashes. Non-null (epoch
  -- default) so claiming is a single conditional update.
  sync_claimed_until timestamptz NOT NULL DEFAULT 'epoch',
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.hockey_sync_state ENABLE ROW LEVEL SECURITY;

-- Members can read their org's sync state; all writes go through the service client.
CREATE POLICY "Members can select hockey_sync_state"
  ON public.hockey_sync_state FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.update_hockey_sync_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_hockey_sync_state_updated_at
  BEFORE UPDATE ON public.hockey_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_hockey_sync_state_updated_at();

-- Sync-related columns on matches.
ALTER TABLE public.matches
  ADD COLUMN external_id bigint,
  ADD COLUMN source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'file_import', 'hockey_sync')),
  ADD COLUMN cancelled_upstream boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN review_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN last_synced_at timestamptz;

-- One upstream match maps to at most one row per organization.
CREATE UNIQUE INDEX idx_matches_org_external
  ON public.matches (organization_id, external_id)
  WHERE external_id IS NOT NULL;
