-- 0018 — Lakeland becomes its own market: carve its goal out of Orlando.
--
-- LAKELAND RULING (2026-08-06) reverses the 2026-08-04 "ORL+LAKE → Orlando"
-- fold. Lakeland is now a first-class display market everywhere.
--
-- WHAT WAS WRONG
-- The two goal tables disagreed about Lakeland, which is exactly why MTD and
-- YTD showed company goals on different bases:
--
--   scorecard_goals (live)   LAKE_MKT = $0, REECE = $10,400,000
--                            (= Σ of the SIX non-Lakeland offices)
--   scorecard_goals_monthly  LAKE_MKT has a real goal every month, and the
--                            REECE row = Σ offices INCLUDING Lakeland
--
--   ⇒ MTD rendered $10,400,000 while YTD rendered $84,455,826 (Σ Jan–Aug incl.
--     Lakeland). Two numbers for one idea, on the same screen.
--
-- RULED: carve-out — the company total does NOT move. Lakeland's dollars come
-- out of Orlando, because Lakeland's numbers previously lived inside Orlando's
-- row:
--
--   ORL_MKT  1,736,866.40 → 1,598,142.40   (− Lakeland's monthly goal)
--   LAKE_MKT         0.00 →   138,724.00
--   REECE (derived Σ)     = 10,400,000.00  (unchanged)
--
-- Consequence, stated plainly: the YTD company period goal falls from
-- $84,455,826 to $83,200,000 (8 × $10,400,000) and Orlando's own goal falls by
-- Lakeland's share. Both follow directly from holding the company total fixed.
--
-- SCOPE — Jan..current month only.
-- Jan–Aug 2026 are on the legacy basis: Orlando is a flat $1,736,866.40 every
-- month and the $10,400,000 distribution was run across SIX offices, with
-- Lakeland's goal sitting OUTSIDE it (its rows carry no distribution_id). Those
-- are the months that need carving, and the only ones feeding a displayed
-- figure today.
--
-- Sept–Dec 2026 are already correct under the new model: Orlando varies per
-- month, Lakeland carries its own allocation, and Σ offices already equals the
-- REECE row (to within a ≤$2 largest-remainder rounding artifact). They are
-- deliberately left untouched — re-carving them would silently cut forward
-- company targets by Lakeland's share for no reason.
--
-- Money in these tables is NUMERIC dollars (pre-existing schema), exact to the
-- cent in NUMERIC.

BEGIN;

-- The last month this migration carves: the current ET month.
CREATE TEMP TABLE _carve_bound ON COMMIT DROP AS
SELECT date_trunc('month', (now() AT TIME ZONE 'America/New_York'))::date AS last_month;

-- ── 1. Month history: Orlando gives up exactly that month's Lakeland goal ────
-- Lakeland's own rows already hold the right figures and are left untouched.

UPDATE scorecard_goals_monthly o
SET goal_dollars = o.goal_dollars - l.goal_dollars,
    updated_by = 'migration:0018_lakeland_goal_carveout',
    updated_at = now()
FROM scorecard_goals_monthly l, _carve_bound b
WHERE o.market = 'ORL_MKT'
  AND l.market = 'LAKE_MKT'
  AND l.goal_month = o.goal_month
  AND o.goal_month <= b.last_month;

-- ── 2. Company rows are derived Σ offices — recompute the carved months ──────
-- Standing ruling: the company goal is derived on read (Σ offices). The stored
-- REECE rows are a materialized convenience and must agree with that sum.

UPDATE scorecard_goals_monthly r
SET goal_dollars = s.total,
    updated_by = 'migration:0018_lakeland_goal_carveout',
    updated_at = now()
FROM (
  SELECT goal_month, sum(goal_dollars) AS total
  FROM scorecard_goals_monthly
  WHERE market <> 'REECE'
  GROUP BY goal_month
) s, _carve_bound b
WHERE r.market = 'REECE'
  AND r.goal_month = s.goal_month
  AND r.goal_month <= b.last_month;

-- ── 3. Live goals: same carve, sourced from the current month's frozen row ───
-- Sourcing from scorecard_goals_monthly (rather than a hardcoded constant)
-- keeps the live table and the month history in agreement by construction.

UPDATE scorecard_goals g
SET monthly_goal_dollars = g.monthly_goal_dollars - m.goal_dollars,
    updated_by = 'migration:0018_lakeland_goal_carveout',
    updated_at = now()
FROM scorecard_goals_monthly m, _carve_bound b
WHERE g.market = 'ORL_MKT'
  AND m.market = 'LAKE_MKT'
  AND m.goal_month = b.last_month;

UPDATE scorecard_goals g
SET monthly_goal_dollars = m.goal_dollars,
    goal_mode = 'dollars',
    updated_by = 'migration:0018_lakeland_goal_carveout',
    updated_at = now()
FROM scorecard_goals_monthly m, _carve_bound b
WHERE g.market = 'LAKE_MKT'
  AND m.market = 'LAKE_MKT'
  AND m.goal_month = b.last_month;

-- ── 4. Fail closed ──────────────────────────────────────────────────────────
-- Assert the invariant this migration exists to preserve. Any violation aborts
-- the whole transaction rather than leaving the goal tables half-carved.

DO $$
DECLARE
  v_offices    numeric;
  v_company    numeric;
  v_lake       numeric;
  v_orl        numeric;
  v_bad_months int;
  v_drifted    int;
BEGIN
  SELECT sum(monthly_goal_dollars) INTO v_offices
    FROM scorecard_goals WHERE market <> 'REECE';
  SELECT monthly_goal_dollars INTO v_company
    FROM scorecard_goals WHERE market = 'REECE';
  SELECT monthly_goal_dollars INTO v_lake
    FROM scorecard_goals WHERE market = 'LAKE_MKT';
  SELECT monthly_goal_dollars INTO v_orl
    FROM scorecard_goals WHERE market = 'ORL_MKT';

  -- The company total must not have moved.
  IF v_company IS DISTINCT FROM 10400000 THEN
    RAISE EXCEPTION 'scorecard_goals: company goal moved to % (must stay 10,400,000)', v_company;
  END IF;

  -- Σ of the SEVEN offices must foot to it exactly.
  IF v_offices IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'scorecard_goals: Σ offices (%) != company (%)', v_offices, v_company;
  END IF;

  -- Lakeland must no longer be zeroed, and Orlando must have given the dollars.
  IF v_lake IS NULL OR v_lake <= 0 THEN
    RAISE EXCEPTION 'scorecard_goals: LAKE_MKT still has no goal (%)', v_lake;
  END IF;
  IF v_orl IS DISTINCT FROM (1736866.40 - v_lake) THEN
    RAISE EXCEPTION 'scorecard_goals: ORL_MKT is % — expected % after the carve',
      v_orl, 1736866.40 - v_lake;
  END IF;

  -- Every carved month foots exactly.
  SELECT count(*) INTO v_bad_months FROM (
    SELECT goal_month
    FROM scorecard_goals_monthly
    WHERE goal_month <= date_trunc('month', (now() AT TIME ZONE 'America/New_York'))::date
    GROUP BY goal_month
    HAVING sum(goal_dollars) FILTER (WHERE market <> 'REECE')
        IS DISTINCT FROM max(goal_dollars) FILTER (WHERE market = 'REECE')
  ) x;
  IF v_bad_months > 0 THEN
    RAISE EXCEPTION 'scorecard_goals_monthly: % carved month(s) where Σ offices != REECE', v_bad_months;
  END IF;

  -- Untouched forward months keep their pre-existing ≤$2 rounding drift, but
  -- must not have drifted further — that would mean this migration touched them.
  SELECT count(*) INTO v_drifted FROM (
    SELECT goal_month
    FROM scorecard_goals_monthly
    WHERE goal_month > date_trunc('month', (now() AT TIME ZONE 'America/New_York'))::date
    GROUP BY goal_month
    HAVING abs(
      coalesce(sum(goal_dollars) FILTER (WHERE market <> 'REECE'), 0)
      - coalesce(max(goal_dollars) FILTER (WHERE market = 'REECE'), 0)
    ) > 2
  ) y;
  IF v_drifted > 0 THEN
    RAISE EXCEPTION 'scorecard_goals_monthly: % forward month(s) drifted — should be untouched', v_drifted;
  END IF;
END $$;

COMMIT;
