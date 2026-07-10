-- 0012_scorecard_goals_monthly.sql — D6 per-market / per-month goal history (LP Supabase)
--
-- scorecard_goals holds ONE live goal row per market (the current, editable target).
-- This table freezes a goal per (market, goal_month) so multi-month periods (3 Months /
-- YTD) can sum the goal that was actually in force each month instead of applying the
-- current goal retroactively. The admin GoalEditor dual-writes: it upserts the live
-- scorecard_goals row AND the frozen scorecard_goals_monthly row for the chosen month.
--
-- goal_month is the first-of-month date. goal_dollars is the flat monthly $ goal (the
-- growth-mode baseline is resolved at read time, same as scorecard_goals). Read layer
-- falls back to scorecard_goals × month-count ("Goal (est.)") for months with no frozen
-- row. Additive, idempotent, RLS SELECT for authenticated (writes via service role).

CREATE TABLE IF NOT EXISTS scorecard_goals_monthly (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market               text NOT NULL,
  goal_month           date NOT NULL,
  goal_mode            text NOT NULL DEFAULT 'dollars',
  goal_dollars         numeric NOT NULL DEFAULT 0,
  growth_pct           numeric,
  working_days         integer NOT NULL DEFAULT 26,
  target_close_pct     numeric,
  target_demo_pct      numeric,
  target_good_rate_pct numeric,
  target_ko_pct        numeric,
  trailing_nsli        numeric,
  updated_by           text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market, goal_month)
);

ALTER TABLE scorecard_goals_monthly ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scorecard_goals_monthly'
      AND policyname = 'scorecard_goals_monthly_read'
  ) THEN
    CREATE POLICY scorecard_goals_monthly_read
      ON scorecard_goals_monthly FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
