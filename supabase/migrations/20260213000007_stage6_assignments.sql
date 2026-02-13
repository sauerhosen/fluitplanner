-- Stage 6: Assignments table for umpire-to-match assignment

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid REFERENCES public.polls ON DELETE CASCADE NOT NULL,
  match_id uuid REFERENCES public.matches ON DELETE CASCADE NOT NULL,
  umpire_id uuid REFERENCES public.umpires ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(match_id, umpire_id)
);

CREATE INDEX idx_assignments_poll_id ON public.assignments (poll_id);
CREATE INDEX idx_assignments_match_id ON public.assignments (match_id);

-- RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select assignments"
  ON public.assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert assignments"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete assignments"
  ON public.assignments FOR DELETE TO authenticated
  USING (true);
