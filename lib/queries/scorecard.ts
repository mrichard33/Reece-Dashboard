import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { getAggregateActuals } from "@/lib/queries/scorecardAggregate";

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
  // Forecast goal mode + the trailing baseline used in growth mode (Phase 3A).
  goal: {
    mode: "dollars" | "growth_pct";
    growth_pct: number | null;
    baseline_net_sales: number | null;
    baseline_source: GoalBaselineSource;
    /** The dollar goal actually driving the figures (= monthly_goal_dollars). */
    effective_monthly_goal: number;
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
export async function getBaselineNetSales(
  sb: Sb,
  market: string,
  periodStart: string,
): Promise<{ value: number; source: GoalBaselineSource }> {
  const [y, m] = periodStart.split("-");
  const priorYearStart = `${Number(y) - 1}-${m}-01`;

  const { data: py } = await sb
    .from("lp_market_scorecard_daily")
    .select("net_sales")
    .eq("market", market)
    .eq("period_start", priorYearStart)
    .order("as_of_date", { ascending: false })
    .limit(1);
  const pyVal = py?.[0]?.net_sales;
  if (pyVal != null) {
    return { value: Math.round(Number(pyVal)), source: "prior_year_same_month" };
  }

  // Latest snapshot per prior month → average the 3 most recent.
  const { data: rows } = await sb
    .from("lp_market_scorecard_daily")
    .select("net_sales, period_start, as_of_date")
    .eq("market", market)
    .lt("period_start", periodStart)
    .order("period_start", { ascending: false })
    .order("as_of_date", { ascending: false })
    .limit(200);
  const latestPerMonth = new Map<string, number>();
  for (const r of (rows ?? []) as { net_sales: unknown; period_start: string }[]) {
    if (!latestPerMonth.has(r.period_start)) latestPerMonth.set(r.period_start, Number(r.net_sales) || 0);
  }
  const last3 = [...latestPerMonth.values()].slice(0, 3);
  if (last3.length === 0) return { value: 0, source: "none" };
  const avg = Math.round(last3.reduce((a, b) => a + b, 0) / last3.length);
  const source: GoalBaselineSource =
    last3.length >= 3 ? "trailing_3mo_avg" : last3.length === 2 ? "trailing_2mo_avg" : "trailing_1mo";
  return { value: avg, source };
}

function pts(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

function derive(
  actuals: ScorecardActuals,
  goals: ScorecardGoals,
  goalMeta: ScorecardDerived["goal"],
): ScorecardDerived {
  // Selling-day basis: prefer the denominator the LP-MCP job persisted with the
  // snapshot (working_days_in_period); fall back to the editable goal for
  // pre-Step-1 rows. `elapsed` is now selling days (writer-side), so numerator
  // and denominator share one basis.
  const wd = actuals.working_days_in_period ?? goals.working_days ?? 1;
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
  const effectiveGoals: ScorecardGoals = { ...goals, monthly_goal_dollars: effectiveGoal };
  const goalMeta: ScorecardDerived["goal"] = {
    mode: goals.goal_mode,
    growth_pct: goals.growth_pct,
    baseline_net_sales: baseline.source === "none" ? null : baseline.value,
    baseline_source: baseline.source,
    effective_monthly_goal: effectiveGoal,
  };

  return {
    actuals,
    goals: effectiveGoals,
    derived: derive(actuals, effectiveGoals, goalMeta),
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
    return buildView(sb, market, actuals);
  }

  // recompute
  const recomputed = await fetchScorecardPreview(market, resolved);
  if (!recomputed) return null;
  return buildView(sb, market, recomputed.actuals);
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
