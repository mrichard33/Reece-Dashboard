-- 0008_scorecard_goal_modes.sql — Phase 3A (LP Supabase)
--
-- Two goal-entry modes on the editable scorecard_goals row:
--   goal_mode = 'dollars'    → monthly_goal_dollars is the goal (today's behavior)
--   goal_mode = 'growth_pct' → goal $ is derived at read time as
--                              (trailing baseline net sales) × (1 + growth_pct/100).
-- The baseline (prior-year-same-month, else trailing-3-month avg net sales) is read
-- from lp_market_scorecard_daily in lib/queries/scorecard.ts and surfaced in the view.
--
-- Additive + nullable; default preserves current 'dollars' behavior. Idempotent.

ALTER TABLE scorecard_goals
  ADD COLUMN IF NOT EXISTS goal_mode  text DEFAULT 'dollars',
  ADD COLUMN IF NOT EXISTS growth_pct numeric;
