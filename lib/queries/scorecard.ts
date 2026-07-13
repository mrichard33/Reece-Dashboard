import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { getAggregateActuals } from "@/lib/queries/scorecardAggregate";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
} from "@/lib/date/sellingDays";

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
  /** Selling days elapsed [period_start, as_of] (Mon–Sat minus Reece closures). */
  days_elapsed: number;
  /** Selling days in the full month — goal-proration denominator. Null on
   *  pre-Step-1 snapshots; read layer falls back to scorecard_goals.working_days. */
  working_days_in_period: number | null;
  /** Selling days in the ENTIRE selected period (whole year for YTD, whole quarter
   *  for QTD, the month for a single-month view). Drives the WORKING/ELAPSED tile,
   *  the elapsed-% and the projected-pace denominator so they expand with the
   *  filter. Set only on aggregate periods; single-month/recompute paths leave it
   *  null and the read layer falls back to working_days_in_period. */
  period_working_days?: number | null;
  leads: number;
  issued: number;
  sets: number;
  demos: number;
  sales: number;
  net_issue: number;
  net_close: number;
  ko_count: number;
  good_business: number;
  gross_sales: number;
  net_sales: number;
  released_dollars: number | null;
  working_dollars: number | null;
  pending_total: number | null;
  pending_dollars: number;
  deposits: number;
  raw_leads_in: number | null;
  pct_issue: number | null;
  demo_pct: number | null;
  close_pct: number | null;
  pct_net_close: number | null;
  good_rate_pct: number | null;
  ko_pct: number | null;
  gsli: number | null;
  nsli: number | null;
  avg_sale: number | null;
  reconciled: boolean;
  /** Provenance: 'net_report_rtp' = report-sourced historical actual; 'lp_api' = live
   *  compute; 'mixed' = an aggregate spanning both (seam marker). */
  computed_from: string | null;
  created_at: string | null;
  /** Tie-out aids emitted by the LP-MCP engine (status/bucket/non-demo tallies). */
  raw_inputs: {
    status_tally?: Record<string, number>;
    bucket_tally?: {
      released_dollars: number;
      working_dollars: number;
      other_pending: number;
      cancelled_dollars: number;
    };
    non_demo_tally?: Record<string, number>;
    revenue_basis?: string;
    raw_leads_basis?: string;
    [k: string]: unknown;
  } | null;
};

export type ScorecardGoals = {
  market: string;
  goal_mode: "dollars" | "growth_pct";
  monthly_goal_dollars: number;
  growth_pct: number | null;
  working_days: number;
  target_close_pct: number;
  target_good_rate_pct: number;
  target_demo_pct: number;
  target_ko_pct: number;
  trailing_nsli: number;
  /** Optional funnel-stage targets (sql/033). When null the stage goal rows read
   *  "no target" instead of a bare "—". */
  target_issue_pct: number | null;
  target_net_close_pct: number | null;
  updated_by: string | null;
  updated_at: string;
};

/** Which trailing window produced the growth-mode baseline net sales. */
export type GoalBaselineSource =
  | "prior_year_same_month"
  | "trailing_3mo_avg"
  | "trailing_2mo_avg"
  | "trailing_1mo"
  | "none";

export type ScorecardDerived = {
  monthly_goal_dollars: number;
  /** Full goal for the ENTIRE selected period — Σ of every month's goal in range,
   *  UNPRORATED (the "Period Goal"). Equals the single month's goal for a month
   *  view; the sum of Jan…current-month goals for YTD. */
  period_goal_dollars: number;
  /** Goal $ prorated to the elapsed share of the period — Σ fully-elapsed months +
   *  current month × (elapsed ÷ working days). This is "Target to Date". */
  mtd_goal_dollars: number;
  /** CALCULATED trailing NET average sale (net sales ÷ sales count) — the divisor
   *  that turns the net goal into a target sales count (sales = goal ÷ this). */
  avg_sale_target: number | null;
  /** Which trailing window produced NSLI + avg sale (transparency for the tooltip):
   *  'trailing_3' | 'trailing_6' | 'trailing_12' | 'company'. */
  rate_window: RateWindow | null;
  /** Sales-count sample (contracts) behind the chosen rate window. */
  rate_sample_n: number | null;
  /** % gap between the goal-anchored sales target (goal ÷ avg sale) and the funnel
   *  flow (demos × close%). A material value flags inconsistent office assumptions;
   *  null when either side is uncomputable. */
  sales_target_divergence_pct: number | null;
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
  // Forecast goal mode + the trailing baseline used in growth mode (Phase 3A).
  goal: {
    mode: "dollars" | "growth_pct";
    growth_pct: number | null;
    baseline_net_sales: number | null;
    baseline_source: GoalBaselineSource;
    /** The dollar goal actually driving the figures (= monthly_goal_dollars). */
    effective_monthly_goal: number;
    /** True when the period goal fell back to (live goal × months) because one or
     *  more months in an aggregate range had no frozen scorecard_goals_monthly row. */
    estimated: boolean;
  };
  reconciled: boolean;
};

/** A frozen per-month goal row (scorecard_goals_monthly). */
export type ScorecardMonthlyGoal = {
  market: string;
  goal_month: string;
  goal_mode: "dollars" | "growth_pct";
  goal_dollars: number;
  growth_pct: number | null;
  working_days: number;
  target_close_pct: number | null;
  target_demo_pct: number | null;
  target_good_rate_pct: number | null;
  target_ko_pct: number | null;
  trailing_nsli: number | null;
  updated_by: string | null;
  updated_at: string;
};

export type ScorecardView = {
  actuals: ScorecardActuals;
  goals: ScorecardGoals;
  derived: ScorecardDerived;
};

const DEFAULT_GOALS = (market: string): ScorecardGoals => ({
  market,
  goal_mode: "dollars",
  monthly_goal_dollars: 0,
  growth_pct: null,
  working_days: 26,
  target_close_pct: 30,
  target_good_rate_pct: 70,
  target_demo_pct: 70,
  target_ko_pct: 10,
  trailing_nsli: 0,
  target_issue_pct: null,
  target_net_close_pct: null,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
});

type Sb = Awaited<ReturnType<typeof lpServer>>;

/**
 * Trailing baseline net sales for growth-mode goals. Prefers the same month last
 * year; falls back to the average of up to the last 3 completed months. net_sales
 * is released-to-production $ (Phase 1). Always returns a value so the growth-mode
 * goal and the GoalEditor preview are computable.
 */
/** A prior snapshot row used to derive the growth baseline. */
export type BaselineRow = { net_sales: unknown; period_start: string; as_of_date?: unknown };

/**
 * Pure baseline computation over pre-fetched prior rows (rows MUST be ordered
 * period_start desc, then as_of_date desc — latest first). Prefers same-month-last-
 * year; else averages the latest snapshot of up to the 3 most recent prior months.
 * Shared by getBaselineNetSales (single market) and the batched By-Market rollup so
 * the growth goal is derived identically on both paths.
 */
export function computeBaselineFromRows(
  rows: BaselineRow[],
  periodStart: string,
): { value: number; source: GoalBaselineSource } {
  const [y, m] = periodStart.split("-");
  const priorYearStart = `${Number(y) - 1}-${m}-01`;

  // rows are latest-first, so the first hit for the prior-year month is its latest as_of.
  const py = rows.find((r) => r.period_start === priorYearStart && r.net_sales != null);
  if (py) return { value: Math.round(Number(py.net_sales)), source: "prior_year_same_month" };

  const latestPerMonth = new Map<string, number>();
  for (const r of rows) {
    if (r.period_start < periodStart && !latestPerMonth.has(r.period_start)) {
      latestPerMonth.set(r.period_start, Number(r.net_sales) || 0);
    }
  }
  const last3 = [...latestPerMonth.values()].slice(0, 3);
  if (last3.length === 0) return { value: 0, source: "none" };
  const avg = Math.round(last3.reduce((a, b) => a + b, 0) / last3.length);
  const source: GoalBaselineSource =
    last3.length >= 3 ? "trailing_3mo_avg" : last3.length === 2 ? "trailing_2mo_avg" : "trailing_1mo";
  return { value: avg, source };
}

export async function getBaselineNetSales(
  sb: Sb,
  market: string,
  periodStart: string,
): Promise<{ value: number; source: GoalBaselineSource }> {
  // One query (prior-year-same-month is within period_start < periodStart), then the
  // shared pure resolver. Ordered latest-first so computeBaselineFromRows picks the
  // final state of each month.
  const { data: rows } = await sb
    .from("lp_market_scorecard_daily")
    .select("net_sales, period_start, as_of_date")
    .eq("market", market)
    .lt("period_start", periodStart)
    .order("period_start", { ascending: false })
    .order("as_of_date", { ascending: false })
    .limit(400);
  return computeBaselineFromRows((rows ?? []) as BaselineRow[], periodStart);
}

/**
 * Trailing rates — NSLI (net ÷ leads issued) and NET average sale (net ÷ sales) —
 * CALCULATED from a market's own previous running data, never entered by hand.
 * NSLI converts a dollar goal into leads needed (leads = goal ÷ NSLI); average sale
 * converts it into a sales-count target (sales = goal ÷ avg sale). Both use the SAME
 * window so the target chain stays internally consistent.
 *
 * WINDOW RULE (prior-year-same-month is deliberately NOT used — average sale is a
 * pricing metric with ~5% CV, so seasonal matching buys almost nothing, while a
 * single prior-year month carries full single-month noise and is 12 months stale on
 * data that wasn't backfilled before 2026):
 *   1. Primary: trailing 3 completed months.
 *   2. If its sales count < 30 → widen to trailing 6.
 *   3. If trailing-6 sales count < 30 → widen to trailing 12.
 *   4. If trailing-12 sales count < 20 → fall back to the COMPANY-WIDE rate.
 * A window is NEVER used as a divisor with fewer than 20 contracts. The window
 * actually used and the sales n behind it are surfaced for transparency.
 *
 * FUTURE (not built): if average sale ever develops real seasonality, apply a
 * seasonal INDEX to the trailing base rather than reverting to a noisy single month.
 */
export type RateWindow = "trailing_3" | "trailing_6" | "trailing_12" | "company";

export type TrailingRates = {
  nsli: number | null;
  avgSale: number | null;
  /** Which window produced the rates (null only when there's no data at all). */
  window: RateWindow | null;
  /** Sales-count sample behind the chosen window (contracts). */
  sampleN: number;
};

/** Latest snapshot per completed month, aggregated to the fields the rates need. */
export type RateMonth = { period_start: string; net: number; issued: number; sales: number };

const MIN_WIDEN = 30; // widen the window below this sales count …
const MIN_USE = 20; //   … but never divide by a window under this many contracts.

/** Σ net/issued/sales over the k most recent months (months MUST be latest-first). */
function sumWindow(months: RateMonth[], k: number): { net: number; issued: number; sales: number } {
  return months.slice(0, k).reduce(
    (a, r) => ({ net: a.net + r.net, issued: a.issued + r.issued, sales: a.sales + r.sales }),
    { net: 0, issued: 0, sales: 0 },
  );
}

/**
 * Resolve the trailing rates + the window actually used. `marketMonths` and
 * `companyMonths` MUST be latest-first (most recent completed month first).
 */
export function computeTrailingRates(
  marketMonths: RateMonth[],
  companyMonths: RateMonth[],
): TrailingRates {
  const rate = (n: number, d: number): number | null => (d > 0 ? Math.round(n / d) : null);
  const at = (w: { net: number; issued: number; sales: number }, window: RateWindow): TrailingRates => ({
    nsli: rate(w.net, w.issued),
    avgSale: rate(w.net, w.sales),
    window,
    sampleN: w.sales,
  });

  const w3 = sumWindow(marketMonths, 3);
  if (w3.sales >= MIN_WIDEN) return at(w3, "trailing_3");
  const w6 = sumWindow(marketMonths, 6);
  if (w6.sales >= MIN_WIDEN) return at(w6, "trailing_6");
  const w12 = sumWindow(marketMonths, 12);
  if (w12.sales >= MIN_USE) return at(w12, "trailing_12");

  // Too thin to trust the market's own history — use the company-wide rate.
  const c3 = sumWindow(companyMonths, 3);
  if (c3.sales > 0) return at(c3, "company");
  // No usable data anywhere (brand-new market, empty warehouse).
  return { nsli: null, avgSale: null, window: null, sampleN: 0 };
}

/** Latest snapshot per completed month (rows MUST be period_start desc, as_of desc). */
function latestRateMonths(rows: Record<string, unknown>[]): RateMonth[] {
  const byMonth = new Map<string, RateMonth>();
  for (const r of rows) {
    const ps = String(r.period_start);
    if (!byMonth.has(ps)) {
      byMonth.set(ps, {
        period_start: ps,
        net: Number(r.net_sales) || 0,
        issued: Number(r.issued) || 0,
        sales: Number(r.sales) || 0,
      });
    }
  }
  return [...byMonth.values()]; // desc order preserved from the query
}

/**
 * Trailing NSLI + NET average sale for a market as of `anchorMonth` (first-of-month),
 * with the min-sample window rule and company-wide fallback. One query for the
 * market, one for the company (REECE) — skipped when the market IS the company.
 */
export async function getTrailingRates(
  sb: Sb,
  market: string,
  anchorMonth: string,
): Promise<TrailingRates> {
  const query = (m: string) =>
    sb
      .from("lp_market_scorecard_daily")
      .select("net_sales, issued, sales, period_start, as_of_date")
      .eq("market", m)
      .lt("period_start", anchorMonth)
      .order("period_start", { ascending: false })
      .order("as_of_date", { ascending: false })
      .limit(400);

  if (market === "REECE") {
    const { data } = await query("REECE");
    const months = latestRateMonths((data ?? []) as Record<string, unknown>[]);
    return computeTrailingRates(months, months);
  }

  const [mkt, company] = await Promise.all([query(market), query("REECE")]);
  return computeTrailingRates(
    latestRateMonths((mkt.data ?? []) as Record<string, unknown>[]),
    latestRateMonths((company.data ?? []) as Record<string, unknown>[]),
  );
}

function pts(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

function derive(
  actuals: ScorecardActuals,
  goals: ScorecardGoals,
  goalMeta: ScorecardDerived["goal"],
  periodGoalOverride?: number | null,
  periodGoalFull?: number | null,
  rates?: TrailingRates,
): ScorecardDerived {
  const avgSaleTarget = rates?.avgSale ?? null;
  // Selling-day basis: prefer the denominator the LP-MCP job persisted with the
  // snapshot (working_days_in_period); fall back to the editable goal for
  // pre-Step-1 rows. `elapsed` is now selling days (writer-side), so numerator
  // and denominator share one basis.
  const wd = actuals.working_days_in_period ?? goals.working_days ?? 1;
  const elapsed = actuals.days_elapsed || 1;
  // Aggregate periods (3 Months / YTD) sum the frozen monthly goals in range;
  // single-month snapshots prorate the live monthly goal by elapsed selling days.
  const mtd_goal_dollars =
    periodGoalOverride != null
      ? Math.round(periodGoalOverride)
      : Math.round(goals.monthly_goal_dollars * (elapsed / wd));
  // Full (unprorated) goal for the whole period. Aggregate → Σ of every month's
  // goal in range; single month → the month's goal. Never the current-month goal
  // alone for a multi-month view.
  const period_goal_dollars =
    periodGoalFull != null ? Math.round(periodGoalFull) : goals.monthly_goal_dollars;

  // Target lead funnel, one direction from the NET goal (goal is RTP net, so every
  // divisor is net):
  //   issued = goal ÷ NSLI  →  demos = issued × demo%  →  sales = goal ÷ NET avg sale
  // Sales is anchored to the goal directly (goal ÷ avg sale), NOT back-derived from
  // demos × close%, so it can't drift off the dollar goal.
  const target_issued_total = goals.trailing_nsli > 0
    ? goals.monthly_goal_dollars / goals.trailing_nsli
    : null;
  const target_issued_per_day = target_issued_total != null
    ? Math.round((target_issued_total / wd) * 10) / 10
    : null;
  const target_demoed_total = target_issued_total != null
    ? target_issued_total * (goals.target_demo_pct / 100)
    : null;
  const target_demoed_per_day = target_demoed_total != null
    ? Math.round((target_demoed_total / wd) * 10) / 10
    : null;
  const target_closed_total = avgSaleTarget && avgSaleTarget > 0
    ? goals.monthly_goal_dollars / avgSaleTarget
    : null;
  const target_closed_per_day = target_closed_total != null
    ? Math.round((target_closed_total / wd) * 10) / 10
    : null;

  // Consistency signal (surface, don't reconcile): the goal-anchored sales target
  // (goal ÷ avg sale) and the funnel-flow sales (demos × close%) should land in the
  // same neighborhood. A material gap means the office's demo%/close%/NSLI/avg-sale
  // assumptions are internally inconsistent.
  const closed_via_flow = target_demoed_total != null
    ? target_demoed_total * (goals.target_close_pct / 100)
    : null;
  const sales_target_divergence_pct =
    target_closed_total != null && closed_via_flow != null && closed_via_flow > 0
      ? Math.round((Math.abs(target_closed_total - closed_via_flow) / closed_via_flow) * 1000) / 10
      : null;

  return {
    monthly_goal_dollars: goals.monthly_goal_dollars,
    period_goal_dollars,
    mtd_goal_dollars,
    avg_sale_target: avgSaleTarget ?? null,
    rate_window: rates?.window ?? null,
    rate_sample_n: rates?.sampleN ?? null,
    sales_target_divergence_pct,
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
    goal: goalMeta,
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

  return buildView(sb, market, actuals);
}

/**
 * Merge an actuals row with its editable goals + derived goal/pace/variance into a
 * ScorecardView. Shared by every sourcing path (stored snapshot, LP recompute
 * preview, multi-month aggregate) so they render identically.
 */
async function buildView(
  sb: Sb,
  market: string,
  actuals: ScorecardActuals,
  resolved?: ResolvedPeriod,
): Promise<ScorecardView> {
  const { data: goalsRow } = await sb
    .from("scorecard_goals")
    .select("*")
    .eq("market", market)
    .maybeSingle();
  const goals = (goalsRow as ScorecardGoals | null) ?? DEFAULT_GOALS(market);

  // Always resolve the trailing baseline so growth mode and the GoalEditor preview
  // are computable; in growth mode it also overrides the effective dollar goal.
  const baseline = await getBaselineNetSales(sb, market, actuals.period_start);
  const effectiveGoal =
    goals.goal_mode === "growth_pct" && goals.growth_pct != null
      ? Math.round(baseline.value * (1 + goals.growth_pct / 100))
      : goals.monthly_goal_dollars;

  // NSLI and NET average sale are CALCULATED trailing rates (never the stored/
  // possibly-stale value), anchored to the current month so every period view uses
  // one current planning rate. The min-sample window rule + company fallback keep a
  // thin market from producing a nonsense divisor. They drive the target lead funnel
  // (issued = goal ÷ NSLI, sales = goal ÷ avg sale) and the displayed KPIs.
  const nsliAnchor = firstOfMonthUTC(new Date());
  const rates = await getTrailingRates(sb, market, nsliAnchor);
  const effectiveGoals: ScorecardGoals = {
    ...goals,
    monthly_goal_dollars: effectiveGoal,
    trailing_nsli: rates.nsli ?? goals.trailing_nsli,
  };

  // Aggregate periods sum the frozen monthly goals across the range (D4); single
  // months use the normal elapsed-day proration in derive().
  let periodGoalOverride: number | null = null;
  let periodGoalFull: number | null = null;
  let estimated = false;
  if (resolved && resolved.source === "aggregate") {
    const pg = await resolveAggregatePeriodGoal(sb, market, resolved, goals, effectiveGoal);
    periodGoalOverride = pg.mtd_goal_dollars;
    periodGoalFull = pg.period_goal_dollars;
    estimated = pg.estimated;
  }

  const goalMeta: ScorecardDerived["goal"] = {
    mode: goals.goal_mode,
    growth_pct: goals.growth_pct,
    baseline_net_sales: baseline.source === "none" ? null : baseline.value,
    baseline_source: baseline.source,
    effective_monthly_goal: effectiveGoal,
    estimated,
  };

  return {
    actuals,
    goals: effectiveGoals,
    derived: derive(actuals, effectiveGoals, goalMeta, periodGoalOverride, periodGoalFull, rates),
  };
}

/** Month-first-of-month strings spanning [periodStart, periodEnd], inclusive. */
function monthsInRange(periodStart: string, periodEnd: string): string[] {
  const out: string[] = [];
  let y = Number(periodStart.slice(0, 4));
  let m = Number(periodStart.slice(5, 7));
  const endY = Number(periodEnd.slice(0, 4));
  const endM = Number(periodEnd.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Period goal for an aggregate range = Σ over each month of the goal in force that
 * month, with the month containing `asOf` prorated by elapsed selling days. Prefers
 * the frozen scorecard_goals_monthly row; falls back to the live goal (× 1 month,
 * flagged `estimated`) when a month has no frozen row.
 */
async function resolveAggregatePeriodGoal(
  sb: Sb,
  market: string,
  resolved: ResolvedPeriod,
  liveGoals: ScorecardGoals,
  effectiveMonthlyGoal: number,
): Promise<{ mtd_goal_dollars: number; period_goal_dollars: number; estimated: boolean }> {
  const cal = resolveSellingCalendar();
  const months = monthsInRange(resolved.periodStart, resolved.periodEnd);

  const { data: frozenRows } = await sb
    .from("scorecard_goals_monthly")
    .select("*")
    .eq("market", market)
    .in("goal_month", months);
  const frozen = new Map<string, ScorecardMonthlyGoal>();
  for (const r of (frozenRows ?? []) as ScorecardMonthlyGoal[]) {
    frozen.set(String(r.goal_month).slice(0, 10), r);
  }

  // `total` = Target to Date (current month prorated). `periodTotal` = Period Goal
  // (every month in range counted in full, unprorated).
  let total = 0;
  let periodTotal = 0;
  let estimated = false;
  for (const monthStart of months) {
    const y = Number(monthStart.slice(0, 4));
    const mo = Number(monthStart.slice(5, 7));
    const monthEnd = new Date(Date.UTC(y, mo, 0, 12, 0, 0)).toISOString().slice(0, 10);

    // Full-month dollar goal for this month.
    const row = frozen.get(monthStart);
    let monthGoal: number;
    if (row) {
      monthGoal =
        row.goal_mode === "growth_pct" && row.growth_pct != null
          ? Math.round((await getBaselineNetSales(sb, market, monthStart)).value * (1 + row.growth_pct / 100))
          : Number(row.goal_dollars) || 0;
    } else {
      monthGoal = effectiveMonthlyGoal;
      estimated = true;
    }

    // Period Goal counts every month in range at full.
    periodTotal += monthGoal;

    // Target to Date: prorate the month that contains asOf; fully-elapsed months
    // count in full; months entirely after asOf contribute nothing.
    if (resolved.asOf >= monthEnd) {
      total += monthGoal;
    } else if (resolved.asOf >= monthStart) {
      const wd = sellingDaysInPeriod(monthStart, monthEnd, cal) || 1;
      const elapsed = sellingDaysElapsed(monthStart, resolved.asOf, cal);
      total += monthGoal * (elapsed / wd);
    }
  }
  void liveGoals; // reserved: per-month live-goal history could refine the fallback
  return {
    mtd_goal_dollars: Math.round(total),
    period_goal_dollars: Math.round(periodTotal),
    estimated,
  };
}

/** Coerce a Postgres numeric (string over PostgREST) to number | null. */
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function i(v: unknown): number {
  return n(v) ?? 0;
}

/** Normalize the LP-MCP preview route's `actuals` payload into ScorecardActuals. */
function mapRecomputedActuals(raw: Record<string, unknown>, market: string): ScorecardActuals {
  return {
    market: String(raw.market ?? market),
    as_of_date: String(raw.as_of_date ?? ""),
    period_start: String(raw.period_start ?? ""),
    period_end: String(raw.period_end ?? ""),
    days_elapsed: i(raw.days_elapsed),
    working_days_in_period: n(raw.working_days_in_period),
    leads: i(raw.leads),
    issued: i(raw.issued),
    sets: i(raw.sets),
    demos: i(raw.demos),
    sales: i(raw.sales),
    net_issue: i(raw.net_issue),
    net_close: i(raw.net_close),
    ko_count: i(raw.ko_count),
    good_business: i(raw.good_business),
    gross_sales: i(raw.gross_sales),
    net_sales: i(raw.net_sales),
    released_dollars: n(raw.released_dollars),
    working_dollars: n(raw.working_dollars),
    pending_total: n(raw.pending_total),
    pending_dollars: i(raw.pending_dollars),
    deposits: i(raw.deposits),
    raw_leads_in: n(raw.raw_leads_in),
    pct_issue: n(raw.pct_issue),
    demo_pct: n(raw.demo_pct),
    close_pct: n(raw.close_pct),
    pct_net_close: n(raw.pct_net_close),
    good_rate_pct: n(raw.good_rate_pct),
    ko_pct: n(raw.ko_pct),
    gsli: n(raw.gsli),
    nsli: n(raw.nsli),
    avg_sale: n(raw.avg_sale),
    reconciled: raw.reconciled === true,
    computed_from: raw.computed_from != null ? String(raw.computed_from) : "lp_api",
    created_at: null,
    raw_inputs: (raw.raw_inputs as ScorecardActuals["raw_inputs"]) ?? null,
  };
}

/**
 * LP-MCP recompute preview for a short window. Calls the goal-scorecard-run route
 * with persist:false so it computes WITHOUT overwriting the stored MTD snapshot,
 * and returns the full actuals row. Cached so repeated period clicks don't re-pull
 * LP. Returns null on any failure (page falls back to the empty state).
 */
export async function fetchScorecardPreview(
  market: string,
  resolved: ResolvedPeriod,
): Promise<{ actuals: ScorecardActuals; sources: Record<string, unknown>[] } | null> {
  const base = (process.env.SCORECARD_RECOMPUTE_BASE_URL || process.env.LP_MCP_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const token = (process.env.LP_MCP_AUTH_TOKEN || "").trim();
  try {
    const res = await fetch(`${base}/n8n/admin/goal-scorecard-run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        period_start: resolved.periodStart,
        period_end: resolved.periodEnd,
        persist: false,
      }),
      next: { revalidate: 600, tags: ["scorecard", market] },
    });
    if (!res.ok) {
      console.error(`[scorecard] recompute ${resolved.key} failed: HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { success?: boolean; actuals?: Record<string, unknown>; sources?: Record<string, unknown>[]; error?: string };
    if (!body?.success || !body.actuals) {
      console.error(`[scorecard] recompute ${resolved.key} returned no actuals: ${body?.error ?? "unknown"}`);
      return null;
    }
    return { actuals: mapRecomputedActuals(body.actuals, market), sources: body.sources ?? [] };
  } catch (err) {
    console.error(`[scorecard] recompute ${resolved.key} threw:`, (err as Error).message);
    return null;
  }
}

/**
 * Period-aware scorecard read. Branches on the resolved sourcing strategy, always
 * returning the same ScorecardView shape so every component renders unchanged:
 *   - snapshot:  stored MTD daily row (no LP call).
 *   - recompute: LP-MCP preview for the window (persist:false, cached).
 *   - aggregate: sum stored monthly snapshots, ratios re-derived.
 * Returns null when the chosen source has no data (page shows the empty state).
 */
export async function getScorecardForPeriod(
  market: string,
  resolved: ResolvedPeriod,
): Promise<ScorecardView | null> {
  if (resolved.source === "snapshot") {
    return getScorecard(market, resolved.asOf);
  }

  const sb = await lpServer();

  if (resolved.source === "aggregate") {
    const actuals = await getAggregateActuals(market, resolved);
    if (!actuals) return null;
    return buildView(sb, market, actuals, resolved);
  }

  // recompute
  const recomputed = await fetchScorecardPreview(market, resolved);
  if (!recomputed) return null;
  return buildView(sb, market, recomputed.actuals, resolved);
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

/** REECE + the 7 markets the per-market editor manages (mirrors MarketPicker). */
export const EDITOR_MARKETS = [
  "REECE",
  "STPET_MKT",
  "ORL_MKT",
  "FTMYR_MKT",
  "JAX_MKT",
  "SAR_MKT",
  "FTLAU_MKT",
  "LAKE_MKT",
] as const;

export type MarketGoalEntry = {
  market: string;
  goals: ScorecardGoals;
  baselineNetSales: number | null;
  /** Effective monthly $ goal (growth mode resolved). For REECE this is the Σ of the
   *  offices (the company goal is the roll-up, never set directly). */
  effectiveGoal: number;
  /** CALCULATED trailing NSLI (net sales ÷ leads issued) for the market — drives the
   *  "leads needed to hit the goal" figure. Null when there's no issued history. */
  nsli: number | null;
  /** Which trailing window produced the NSLI, and the sales-count sample behind it —
   *  surfaced so a small-market figure is explainable. */
  rateWindow: RateWindow | null;
  rateSampleN: number;
};

export type ScorecardGoalsEditorData = {
  markets: MarketGoalEntry[];
  /** Frozen per-month rows for all editor markets — repopulates the form per month. */
  monthly: ScorecardMonthlyGoal[];
  /** Month options (first-of-month, newest first). */
  months: string[];
  /** Current month, first-of-month — the default freeze target. */
  defaultMonth: string;
};

/** Current month, first-of-month (UTC). */
function firstOfMonthUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Current year's months, January through the current month, newest first. */
function yearToDateMonths(now: Date): string[] {
  const y = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1; // 1-12
  const out: string[] = [];
  for (let m = currentMonth; m >= 1; m--) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
  }
  return out;
}

/**
 * Everything the admin GoalEditor needs to edit any OFFICE for the current year to
 * date: each market's live editable goal + growth baseline + effective $ goal +
 * CALCULATED trailing NSLI, the frozen monthly history, and the month options. One
 * parallel fan-out; the editor switches market/month entirely client-side.
 *
 * The company (REECE) entry is the SUM of the offices, not an editable target — its
 * effectiveGoal is the roll-up so callers can show the company total read-only.
 */
export async function getScorecardGoalsForEditor(): Promise<ScorecardGoalsEditorData> {
  const sb = await lpServer();

  // Month options = the current year, January through the current month, newest
  // first (e.g. in July: Jul, Jun, … Jan). No future or prior-year months.
  const months = yearToDateMonths(new Date());
  const defaultMonth = months[0] ?? firstOfMonthUTC(new Date());

  // Frozen monthly rows for the editor markets, limited to the selectable months.
  const { data: monthlyRows } = await sb
    .from("scorecard_goals_monthly")
    .select("*")
    .in("market", EDITOR_MARKETS as unknown as string[])
    .in("goal_month", months);
  const monthly = (monthlyRows as ScorecardMonthlyGoal[] | null) ?? [];

  const entries = await Promise.all(
    EDITOR_MARKETS.map(async (market): Promise<MarketGoalEntry> => {
      const { data } = await sb
        .from("scorecard_goals")
        .select("*")
        .eq("market", market)
        .maybeSingle();
      const goals = (data as ScorecardGoals | null) ?? DEFAULT_GOALS(market);
      const [baseline, rates] = await Promise.all([
        getBaselineNetSales(sb, market, defaultMonth),
        getTrailingRates(sb, market, defaultMonth),
      ]);
      const effectiveGoal =
        goals.goal_mode === "growth_pct" && goals.growth_pct != null
          ? Math.round(baseline.value * (1 + goals.growth_pct / 100))
          : goals.monthly_goal_dollars;
      return {
        market,
        goals,
        baselineNetSales: baseline.source === "none" ? null : baseline.value,
        effectiveGoal,
        nsli: rates.nsli,
        rateWindow: rates.window,
        rateSampleN: rates.sampleN,
      };
    }),
  );

  // The company (REECE) goal is DERIVED — always the sum of the offices, never set
  // directly — so surface its effectiveGoal as that roll-up.
  const officeSum = entries
    .filter((e) => e.market !== "REECE")
    .reduce((a, e) => a + e.effectiveGoal, 0);
  const markets = entries.map((e) =>
    e.market === "REECE" ? { ...e, effectiveGoal: officeSum } : e,
  );

  return { markets, monthly, months, defaultMonth };
}
