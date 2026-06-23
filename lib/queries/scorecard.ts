import { lpServer } from "@/lib/supabase/lp";

/**
 * Goal/variance scorecard read layer.
 *
 * The LP-MCP daily job stores ACTUALS only (lp_market_scorecard_daily). Goal
 * columns, per-day pace targets, and the variance bridge are derived HERE, at
 * read time, from the editable scorecard_goals table — so an admin's goal edit
 * takes effect immediately, with no wait for the next cron run.
 *
 * ⚠ TIE-OUT: target_*_per_day and the variance bridge are LP-internal
 * definitions, provisional until reconciled to a real Reece Monday-a.m. export.
 * `reconciled` drives the PROVISIONAL banner.
 */

export type ScorecardActuals = {
  market: string;
  as_of_date: string;
  period_start: string;
  period_end: string;
  days_elapsed: number;
  leads: number;
  issued: number;
  sets: number;
  demos: number;
  sales: number;
  ko_count: number;
  good_business: number;
  gross_sales: number;
  net_sales: number;
  pending_dollars: number;
  deposits: number;
  demo_pct: number | null;
  close_pct: number | null;
  good_rate_pct: number | null;
  ko_pct: number | null;
  nsli: number | null;
  avg_sale: number | null;
  reconciled: boolean;
};

export type ScorecardGoals = {
  market: string;
  monthly_goal_dollars: number;
  working_days: number;
  target_close_pct: number;
  target_good_rate_pct: number;
  target_demo_pct: number;
  target_ko_pct: number;
  trailing_nsli: number;
  updated_by: string | null;
  updated_at: string;
};

export type ScorecardDerived = {
  monthly_goal_dollars: number;
  /** Goal $ prorated to the elapsed share of the working month. */
  mtd_goal_dollars: number;
  // ⚠ TIE-OUT pace targets (goal $ ÷ trailing NSLI ÷ working days, then funnel %)
  target_issued_per_day: number | null;
  target_demoed_per_day: number | null;
  target_closed_per_day: number | null;
  actual_issued_per_day: number;
  actual_demoed_per_day: number;
  actual_closed_per_day: number;
  // ⚠ TIE-OUT variance bridge — dollarized + per-metric point gaps vs goal.
  variance: {
    dollars: number;
    close_pts: number | null;
    demo_pts: number | null;
    good_rate_pts: number | null;
    ko_pts: number | null;
  };
  reconciled: boolean;
};

export type ScorecardView = {
  actuals: ScorecardActuals;
  goals: ScorecardGoals;
  derived: ScorecardDerived;
};

const DEFAULT_GOALS = (market: string): ScorecardGoals => ({
  market,
  monthly_goal_dollars: 0,
  working_days: 26,
  target_close_pct: 30,
  target_good_rate_pct: 70,
  target_demo_pct: 70,
  target_ko_pct: 10,
  trailing_nsli: 0,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
});

function pts(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

function derive(actuals: ScorecardActuals, goals: ScorecardGoals): ScorecardDerived {
  const wd = goals.working_days || 1;
  const elapsed = actuals.days_elapsed || 1;
  const mtd_goal_dollars = Math.round(goals.monthly_goal_dollars * (elapsed / wd));

  // ⚠ TIE-OUT: target issued/day = monthly goal $ ÷ trailing NSLI ÷ working days.
  const target_issued_total = goals.trailing_nsli > 0
    ? goals.monthly_goal_dollars / goals.trailing_nsli
    : null;
  const target_issued_per_day = target_issued_total != null
    ? Math.round((target_issued_total / wd) * 10) / 10
    : null;
  const target_demoed_per_day = target_issued_per_day != null
    ? Math.round((target_issued_per_day * (goals.target_demo_pct / 100)) * 10) / 10
    : null;
  const target_closed_per_day = target_demoed_per_day != null
    ? Math.round((target_demoed_per_day * (goals.target_close_pct / 100)) * 10) / 10
    : null;

  return {
    monthly_goal_dollars: goals.monthly_goal_dollars,
    mtd_goal_dollars,
    target_issued_per_day,
    target_demoed_per_day,
    target_closed_per_day,
    actual_issued_per_day: Math.round((actuals.issued / elapsed) * 10) / 10,
    actual_demoed_per_day: Math.round((actuals.demos / elapsed) * 10) / 10,
    actual_closed_per_day: Math.round((actuals.sales / elapsed) * 10) / 10,
    variance: {
      dollars: Math.round(actuals.net_sales - mtd_goal_dollars), // ⚠ TIE-OUT
      close_pts: pts(actuals.close_pct, goals.target_close_pct),
      demo_pts: pts(actuals.demo_pct, goals.target_demo_pct),
      good_rate_pts: pts(actuals.good_rate_pct, goals.target_good_rate_pct),
      ko_pts: pts(actuals.ko_pct, goals.target_ko_pct),
    },
    reconciled: actuals.reconciled,
  };
}

/**
 * Latest actuals snapshot for a market (or the snapshot on/just before `asOf`),
 * joined to its editable goals, with goal/pace/variance derived at read time.
 * Returns null when no actuals row exists yet (job hasn't run).
 */
export async function getScorecard(
  market = "REECE",
  asOf?: string,
): Promise<ScorecardView | null> {
  const sb = await lpServer();

  let q = sb
    .from("lp_market_scorecard_daily")
    .select("*")
    .eq("market", market)
    .order("as_of_date", { ascending: false })
    .limit(1);
  if (asOf) q = q.lte("as_of_date", asOf);

  const { data: actualsRows, error: actualsErr } = await q;
  if (actualsErr) throw actualsErr;
  const actuals = (actualsRows?.[0] as ScorecardActuals | undefined) ?? null;
  if (!actuals) return null;

  const { data: goalsRow } = await sb
    .from("scorecard_goals")
    .select("*")
    .eq("market", market)
    .maybeSingle();
  const goals = (goalsRow as ScorecardGoals | null) ?? DEFAULT_GOALS(market);

  return { actuals, goals, derived: derive(actuals, goals) };
}

/** The editable goal row for a market (for the admin editor). */
export async function getScorecardGoals(market = "REECE"): Promise<ScorecardGoals> {
  const sb = await lpServer();
  const { data } = await sb
    .from("scorecard_goals")
    .select("*")
    .eq("market", market)
    .maybeSingle();
  return (data as ScorecardGoals | null) ?? DEFAULT_GOALS(market);
}
