-- 0019_goal_net_basis.sql — record that monthly goals are NET (LP Supabase)
--
-- Monthly goals are net-sales goals: LP's NSA, never GSA. Every read path in
-- Reece-Dashboard already honours that — the pace hero compares
-- `released_dollars ?? net_sales`, the marketing table's dollar row compares
-- `net_sales`, per-market "% to Goal" compares `released_dollars ?? net_sales`,
-- and the NSLI chain divides the goal by a net-over-issued rate. An audit on
-- 2026-08-10 traced every goal↔actual comparison in the repo and found NO goal
-- measured against a gross actual anywhere.
--
-- That is precisely why this migration exists. The basis was true in every
-- comparison and recorded in none of them. `gross_sales`, `gross_sold` and
-- `gsli` live in the same view models one identifier away from the net ones,
-- and the goal columns say nothing about which they are:
--
--   scorecard_goals.monthly_goal_dollars   numeric   -- dollars, basis unstated
--   scorecard_goals_monthly.goal_dollars   numeric   -- dollars, basis unstated
--
-- A single edit swapping one read to a gross metric would compile, pass every
-- test, and overstate attainment by the gross-to-net gap. `goal_basis` makes the
-- basis data instead of convention, so that swap has something to fail against.
--
-- ══ WHY A COLUMN AND NOT A RENAME ══
--
-- Renaming to `goal_net_cents` was considered and rejected on two grounds.
-- (1) It is also a UNIT change: both columns are numeric DOLLARS today, so a
-- name ending in `_cents` would be actively wrong unless every read, write, zod
-- field and UI input converted at the same moment. (2) scorecard_goals is
-- created in LP-MCP (sql/029_goal_scorecard.sql) and read/written by
-- Reece-Dashboard, so a rename must land in two repos in lockstep or the
-- dashboard breaks mid-deploy. An additive column carries the same information
-- with neither hazard, and mirrors the `basis` column 0017 already established
-- on scorecard_goal_distributions.
--
-- Additive and idempotent. Existing rows default to 'net', which is correct:
-- every goal entered to date was entered as net.
--
-- ROLLBACK:
--   ALTER TABLE scorecard_goals         DROP COLUMN IF EXISTS goal_basis;
--   ALTER TABLE scorecard_goals_monthly DROP COLUMN IF EXISTS goal_basis;
--   (Comments drop with their columns. Nothing else depends on them.)

ALTER TABLE scorecard_goals
  ADD COLUMN IF NOT EXISTS goal_basis text NOT NULL DEFAULT 'net'
    CHECK (goal_basis IN ('net', 'gross'));

ALTER TABLE scorecard_goals_monthly
  ADD COLUMN IF NOT EXISTS goal_basis text NOT NULL DEFAULT 'net'
    CHECK (goal_basis IN ('net', 'gross'));

COMMENT ON COLUMN scorecard_goals.goal_basis IS
  'Which sales figure this goal is denominated in. ALWAYS ''net'' in practice — every goal comparison in Reece-Dashboard reads a net actual (net_sales / net_sold / released_dollars). ''gross'' is representable so the column can express a real policy change, but lib/scorecard/goalBasis.ts refuses it on both the write and read paths: switching bases means changing those comparisons deliberately, not discovering later that one drifted.';

COMMENT ON COLUMN scorecard_goals.monthly_goal_dollars IS
  'Monthly NET sales goal, in DOLLARS (numeric, not cents). Net = LP NSA, never GSA — see goal_basis. The NSLI chain divides this by a net-over-gross-issued rate (NSA ÷ NumIssued), so goal and rate numerator must be the same currency; a gross goal here would silently rescale every derived Issued / Leads / Demo target as well as the attainment bar.';

COMMENT ON COLUMN scorecard_goals_monthly.goal_basis IS
  'See scorecard_goals.goal_basis. Frozen per (market, goal_month) alongside goal_dollars.';

COMMENT ON COLUMN scorecard_goals_monthly.goal_dollars IS
  'The frozen monthly NET sales goal, in DOLLARS. Written from scorecard_goals.monthly_goal_dollars at save time — same basis, same units.';

-- Verification
-- SELECT market, monthly_goal_dollars, goal_basis FROM scorecard_goals ORDER BY market;
-- SELECT count(*) FILTER (WHERE goal_basis <> 'net') AS non_net FROM scorecard_goals;          -- expect 0
-- SELECT count(*) FILTER (WHERE goal_basis <> 'net') AS non_net FROM scorecard_goals_monthly;  -- expect 0
