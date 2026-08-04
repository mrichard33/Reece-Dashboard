-- 0017_scorecard_goal_distributions.sql — top-down goal distribution audit trail (LP Supabase)
--
-- RULED 2026-08-04: Mark sets ONE company-wide goal; the system distributes it
-- across the 6 display markets by each market's share of trailing Net Sales
-- (largest-remainder in cents — Σ office goals == company goal EXACTLY).
-- Distribution WRITES the existing per-office goal rows (scorecard_goals +
-- scorecard_goals_monthly); the company (REECE) figure stays DERIVED-ON-READ as
-- Σ offices — this table never becomes a second company-goal source of truth.
--
-- Every run gets one row here so any office goal traces back to the run that
-- produced it ("why did Fort Myers get what it got" is a query, not a memory).
-- Goal rows carry distribution_id; a hand-edited office is detected by its
-- stored dollars differing from this row's allocations — overrides are
-- authoritative and NEVER auto-rebalanced (redistribute is an explicit action,
-- recorded as its own run with basis 'redistribute_remainder').
--
-- Money here is integer CENTS (bigint); the goal tables keep their existing
-- numeric-dollars convention (exactness is asserted in the cents domain before
-- any write). Additive, idempotent, RLS SELECT for authenticated (writes via
-- service role) — same posture as 0012.

CREATE TABLE IF NOT EXISTS scorecard_goal_distributions (
  distribution_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_month         date NOT NULL,                    -- first-of-month the allocation targets
  company_goal_cents bigint NOT NULL CHECK (company_goal_cents >= 0),
  basis              text NOT NULL DEFAULT 'trailing_net'
                     CHECK (basis IN ('trailing_net', 'redistribute_remainder')),
  basis_window_start date,                             -- trailing-net input window (null for redistribute runs)
  basis_window_end   date,
  window_months      integer,                          -- configurable per run (default 6)
  shares             jsonb NOT NULL,                   -- { "ORL_MKT": { share, trailing_net_dollars }, ... }
  allocations        jsonb NOT NULL,                   -- { "ORL_MKT": cents, ... } — Σ == company_goal_cents (asserted app-side)
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         text
);

CREATE INDEX IF NOT EXISTS scorecard_goal_distributions_month_idx
  ON scorecard_goal_distributions (goal_month, created_at DESC);

ALTER TABLE scorecard_goal_distributions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scorecard_goal_distributions'
      AND policyname = 'scorecard_goal_distributions_read'
  ) THEN
    CREATE POLICY scorecard_goal_distributions_read
      ON scorecard_goal_distributions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Trace column on the goal rows a distribution writes. Hand edits keep the id
-- (the row still traces to the run it diverged FROM); divergence itself is the
-- override marker.
ALTER TABLE scorecard_goals         ADD COLUMN IF NOT EXISTS distribution_id uuid;
ALTER TABLE scorecard_goals_monthly ADD COLUMN IF NOT EXISTS distribution_id uuid;

COMMENT ON TABLE scorecard_goal_distributions IS
  'One row per top-down goal-distribution run (ruled 2026-08-04). Office goal rows carry distribution_id; the company goal remains derived-on-read as the sum of offices.';
