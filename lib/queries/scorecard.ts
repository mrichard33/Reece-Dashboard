import { lpServer } from "@/lib/supabase/lp";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { getAggregateActuals } from "@/lib/queries/scorecardAggregate";
import { aggregateActuals } from "@/lib/queries/scorecardAggregate.core";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
  firstOfMonthET,
  todayET,
  addDays,
  yearToDateMonthsET,
  type SellingCalendar,
} from "@/lib/date/sellingDays";
import {
  SCORECARD_MARKETS,
  OFFICE_SOURCE_CODES,
  marketSources,
} from "@/lib/scorecard/markets";
import {
  targetTotals,
  perDayTargets,
  sumPerDayTargets,
  sumTargetTotals,
  perDayActual,
  prorateGoal,
  revenueAnchorDate,
  type PerDayTargets,
  type TargetTotals,
} from "@/lib/scorecard/paceTargets";

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
  /**
   * How far the REVENUE figures actually reach — distinct from as_of_date,
   * which is how far the row reaches. They diverge: on 2026-08-10 the row said
   * 2026-08-07 while revenue said 2026-08-06.
   *
   * The column has existed all along and NOTHING read it — `grep revenue_as_of`
   * over this repo returned zero hits — so a revenue number four days old was
   * rendered with no way for a reader to tell. Null when the sync did not
   * report one (LAKE_MKT, OUT_OF_AREA and UNASSIGNED carry null today, the same
   * three markets carrying a null net).
   */
  revenue_as_of: string | null;
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
  gross_sales: number; // funnel SOLD gross (sold-basis, consistent across live + closed)
  rtp_gross_dollars?: number | null; // report RTP gross (revenue basis) — preserved, not displayed
  /** NULL when no report has landed for the period (pending ≠ zero — the writer
   *  invariant). Read paths must render pending as "—", never coerce to $0. */
  net_sales: number | null;
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
  /** COMPUTED trailing NSLI. The DB column of the same name is a write-through
   *  cache only (refreshed on goal save, never read back — ruled 2026-08-04);
   *  every read path carries the freshly computed value, null when the rate
   *  window has no history. */
  trailing_nsli: number | null;
  /** Unused legacy column (ruled 2026-08-04: issue % is DERIVED from history,
   *  never a hand-set target). Kept in the type for row-shape fidelity; no
   *  read or write path uses it. */
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
   *  current month × (elapsed ÷ working days). This is "Target to Date" for the
   *  COUNTS, which reach the period's own as-of date. */
  mtd_goal_dollars: number;
  /** Goal $ prorated to `revenue_as_of` — the date released dollars actually
   *  reach. The revenue hero divides by THIS, never by `mtd_goal_dollars`:
   *  revenue settled through Aug 6 measured against a target prorated to Aug 10
   *  is understated every day and reads "behind pace" regardless of performance.
   *  Equals `mtd_goal_dollars` when no Net Report has landed for the period.
   *  See docs/revenue-as-of.md. */
  revenue_goal_to_date_dollars: number;
  /** CALCULATED trailing NET average sale (net sales ÷ sales count) — the divisor
   *  that turns the net goal into a target sales count (sales = goal ÷ this). */
  avg_sale_target: number | null;
  /** Which trailing window produced NSLI + avg sale (transparency for the tooltip):
   *  'trailing_3' | 'trailing_6' | 'trailing_12' | 'company'. */
  rate_window: RateWindow | null;
  /** Sales-count sample (contracts) behind the chosen rate window. */
  rate_sample_n: number | null;
  /** First-of-month the rate window ends BEFORE (period-scoped D3 anchor). */
  rate_anchor_month: string | null;
  /** True when the anchor came from the selected period (vs the current-month
   *  fallback for period-less reads). */
  rate_period_scoped: boolean;
  /** % gap between the goal-anchored sales target (goal ÷ avg sale) and the funnel
   *  flow (demos × close%). A material value flags inconsistent office assumptions;
   *  null when either side is uncomputable. */
  sales_target_divergence_pct: number | null;
  // ⚠ TIE-OUT pace targets (per-office NSLI chain: period goal ÷ NSLI ÷ period
  // selling days; company = Σ office per-day targets, never blended NSLI).
  // Leads = issues-needed ÷ historical issue rate (derived, ruled 2026-08-04).
  target_leads_per_day: number | null;
  target_issued_per_day: number | null;
  target_demoed_per_day: number | null;
  target_closed_per_day: number | null;
  /** Actual ÷ elapsed COMPLETED selling days. Null when 0 days have completed
   *  (first of the month) — rendered "—", never a division by zero. */
  actual_leads_per_day: number | null;
  actual_issued_per_day: number | null;
  actual_demoed_per_day: number | null;
  actual_closed_per_day: number | null;
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
  trailing_nsli: null,
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
  sourcesOverride?: readonly string[],
): Promise<{ value: number; source: GoalBaselineSource }> {
  // One query (prior-year-same-month is within period_start < periodStart), then the
  // shared pure resolver. Multi-source display markets (Fort Lauderdale) sum the
  // latest snapshot per source-month before resolving. `sourcesOverride` lets a
  // caller pin the exact source rows (e.g. a SECONDARY source row
  // resolves per-source, not against the combined display-market baseline).
  const sources = sourcesOverride ?? marketSources(market);
  const { data: rows } = await sb
    .from("lp_market_scorecard_daily")
    .select("market, net_sales, issued, sales, leads, raw_leads_in, period_start, as_of_date")
    .in("market", sources as string[])
    .lt("period_start", periodStart)
    .order("period_start", { ascending: false })
    .order("as_of_date", { ascending: false })
    .limit(800);
  const months = latestRateMonths((rows ?? []) as Record<string, unknown>[]);
  return computeBaselineFromRows(rateMonthsToBaselineRows(months), periodStart);
}

/** RateMonth list → BaselineRow list (already summed per month, latest-first). */
function rateMonthsToBaselineRows(months: RateMonth[]): BaselineRow[] {
  return months.map((m) => ({ period_start: m.period_start, net_sales: m.net }));
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
 *   1. Primary — LIVE anchor (viewing the current month): ROLLING 90 DAYS ending
 *      yesterday ET (ruled 2026-08-04: recomputed every day as new data lands,
 *      never stored). At month grain that is every month whose last day falls
 *      inside the window — the current MTD month plus the months covering the
 *      trailing 90 days. Historical (period-scoped) anchors keep the trailing-3
 *      completed months strictly before the period: a frozen period's targets
 *      must not reprice from data that didn't exist yet.
 *   2. If the primary's sales count < 30 → widen to trailing 6 months.
 *   3. If trailing-6 sales count < 30 → widen to trailing 12.
 *   4. If trailing-12 sales count < 20 → fall back to the COMPANY-WIDE rate.
 * A window is NEVER used as a divisor with fewer than 20 contracts. The window
 * actually used and the sales n behind it are surfaced for transparency, and any
 * widening beyond the primary window renders a VISIBLE flag — never a silent
 * substitution.
 *
 * FUTURE (not built): if average sale ever develops real seasonality, apply a
 * seasonal INDEX to the trailing base rather than reverting to a noisy single month.
 */
export type RateWindow = "rolling_90d" | "trailing_3" | "trailing_6" | "trailing_12" | "company";

/** Last calendar day of a YYYY-MM-01 month, as ISO. */
function monthEndOf(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4));
  const m = Number(monthStart.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** First day of the rolling 90-day rate window: 90 days ending yesterday ET. */
export function rolling90WindowStart(): string {
  return addDays(todayET(), -90);
}

export type TrailingRates = {
  nsli: number | null;
  avgSale: number | null;
  /** Historical issue rate = issued ÷ RAW LEADS IN over the SAME window (0–1
   *  fraction). A DERIVED data point (ruled 2026-08-04), never entered by hand —
   *  it turns issues-needed into leads-needed (leads = issues ÷ this). The
   *  denominator is true top-of-funnel raw_leads_in (ruled 2026-08-05) — the
  /** Which window produced the rates (null only when there's no data at all). */
  window: RateWindow | null;
  /** Why nsli/avgSale are null, when they are. Lets a caller render "—" WITH a
   *  reason instead of a bare dash — and distinguishes "no history yet" from
   *  "issued volume exists but nobody measured its net", which is the standing
   *  case for OUT_OF_AREA and can be the case for a thin market like Lakeland.
   *  Null whenever nsli is a real number. */
  unmeasuredReason: string | null;
  /** Sales-count sample behind the chosen window (contracts). */
  sampleN: number;
};

/** Latest snapshot per completed month, aggregated to the fields the rates need.
 *  rawLeads = raw_leads_in (true top-of-funnel); null/absent = untracked
 *  (pre-June-2026) — such months are excluded from BOTH sides of the issue rate. */
export type RateMonth = {
  period_start: string;
  /** Σ of the sources that REPORTED a net. `null` = no source did — unknown,
   *  not zero. A market with issued > 0 and net_sales NULL has an unmeasured
   *  net, and coercing it to 0 dragged the blended rate down with a number
   *  nobody measured. */
  net: number | null;
  issued: number;
  sales: number;
  leads: number;
  /** issued / sales PAIRED with a known net — the honest denominators for
   *  nsli and avgSale. Same idiom as rawLeads/issuedRaw below: a source that
   *  contributed no net contributes no denominator either, so it neither
   *  depresses nor inflates the rate.
   *
   *  Optional: omitted means "pair fully" — issued/sales when net is known, 0
   *  when it is not. That is the right default for a single-source month and
   *  keeps hand-built fixtures honest without spelling both out. The readers
   *  set them explicitly because a MULTI-source month can be part-known. */
  issuedNet?: number;
  salesNet?: number;
  rawLeads?: number | null;
};

const MIN_WIDEN = 30; // widen the window below this sales count …
const MIN_USE = 20; //   … but never divide by a window under this many contracts.

/** Σ net/issued/sales/leads over the k most recent months (months MUST be latest-first).
 *  rawLeads / issuedRaw are the PAIRED issue-rate inputs: only months carrying
 *  raw_leads_in contribute to either side, so pre-tracking months can't skew the rate. */
function sumWindow(
  months: RateMonth[],
  k: number,
): { net: number; issued: number; sales: number; leads: number; rawLeads: number; issuedRaw: number; issuedNet: number; salesNet: number } {
  return months.slice(0, k).reduce(
    (a, r) => ({
      // Only KNOWN nets accumulate, and only alongside their own denominators.
      // When no month in the window reported a net, issuedNet/salesNet stay 0
      // and rate() yields null — "—", never a confident 0.
      net: a.net + (r.net ?? 0),
      issued: a.issued + r.issued,
      sales: a.sales + r.sales,
      leads: a.leads + r.leads,
      rawLeads: a.rawLeads + (r.rawLeads ?? 0),
      issuedRaw: a.issuedRaw + (r.rawLeads != null ? r.issued : 0),
      // `?? ` is the "pair fully" default documented on RateMonth.
      issuedNet: a.issuedNet + (r.issuedNet ?? (r.net == null ? 0 : r.issued)),
      salesNet: a.salesNet + (r.salesNet ?? (r.net == null ? 0 : r.sales)),
    }),
    { net: 0, issued: 0, sales: 0, leads: 0, rawLeads: 0, issuedRaw: 0, issuedNet: 0, salesNet: 0 },
  );
}

/**
 * Resolve the trailing rates + the window actually used. `marketMonths` and
 * `companyMonths` MUST be latest-first (most recent month first). With
 * `opts.windowStart` (the live-anchor path) the primary window is the rolling
 * 90 days — every month whose last day is on/after windowStart; without it,
 * the trailing 3 completed months (historical/period-scoped anchors).
 */
export function computeTrailingRates(
  marketMonths: RateMonth[],
  companyMonths: RateMonth[],
  opts?: { windowStart?: string; excludeFrom?: string },
): TrailingRates {
  // ── the live month is not a rate input ──────────────────────────────────
  //
  // NET LAGS ISSUE BY WEEKS. A job issued on the 3rd is not net until it is
  // released, so the current month always reads artificially low: most of its
  // issued count is in, almost none of its net is. Letting it into a rolling
  // window depressed NSLI, and since issues_needed = periodGoal ÷ nsli, a
  // depressed NSLI INFLATES every derived Issued / Leads / Demo target.
  //
  // Verified 2026-08-10: August contributed LAKE_MKT (net NULL, issued 11) and
  // OUT_OF_AREA (net NULL, issued 48) — 59 issued at zero net — plus REECE's
  // own partial 702,506 over 405 issued.
  //
  // ⚠️ THIS IS NOT THE WHOLE MATURATION PROBLEM. Excluding the current month
  // fixes the window; it does not fix the lag. In August the window still holds
  // July, and a July issue may not reach net until September, so July is in the
  // window while structurally immature and NSLI stays depressed — just less so.
  // The full fix is an NSLI_MATURATION_LAG_DAYS exclusion (~45 days, and it
  // should be MEASURED from the actual issue-date → net-date distribution in
  // report 134 rather than guessed). Tracked as follow-up; do not mistake this
  // change for it.
  const cutoff = opts?.excludeFrom;
  const complete = (ms: RateMonth[]) => (cutoff ? ms.filter((m) => m.period_start < cutoff) : ms);
  marketMonths = complete(marketMonths);
  companyMonths = complete(companyMonths);
  const rate = (n: number, d: number): number | null => (d > 0 ? Math.round(n / d) : null);
  const at = (
    w: { net: number; issued: number; sales: number; leads: number; rawLeads: number; issuedRaw: number; issuedNet: number; salesNet: number },
    window: RateWindow,
  ): TrailingRates => ({
    // Denominators PAIRED with a known net, not the raw counts. Issued whose
    // month reported no net is issued we cannot price, and dividing a partial
    // numerator by a whole denominator is what understated NSLI.
    nsli: rate(w.net, w.issuedNet),
    avgSale: rate(w.net, w.salesNet),
    unmeasuredReason:
      rate(w.net, w.issuedNet) != null
        ? null
        : w.issued > 0
          ? `${w.issued} issued in this window but no net reported against any of it — net is unmeasured, not zero`
          : "no issued volume in the trailing window yet",
    window,
    sampleN: w.sales,
  });

  // Primary window: rolling 90 days (live anchor) or trailing 3 completed
  // months (historical anchor). Months are latest-first, so the window's
  // months are the leading run of the list.
  let primaryK = 3;
  let primaryLabel: RateWindow = "trailing_3";
  if (opts?.windowStart) {
    const ws = opts.windowStart;
    primaryK = marketMonths.filter((m) => monthEndOf(m.period_start) >= ws).length;
    primaryLabel = "rolling_90d";
  }
  const wp = sumWindow(marketMonths, primaryK);
  if (primaryK > 0 && wp.sales >= MIN_WIDEN) return at(wp, primaryLabel);
  const w6 = sumWindow(marketMonths, Math.max(6, primaryK));
  if (w6.sales >= MIN_WIDEN) return at(w6, "trailing_6");
  const w12 = sumWindow(marketMonths, Math.max(12, primaryK));
  if (w12.sales >= MIN_USE) return at(w12, "trailing_12");

  // Too thin to trust the market's own history — use the company-wide rate.
  const c3 = sumWindow(companyMonths, 3);
  if (c3.sales > 0) return at(c3, "company");
  // No usable data anywhere (brand-new market, empty warehouse).
  return {
    nsli: null, avgSale: null, window: null, sampleN: 0,
    unmeasuredReason: "no usable trailing history for this market or the company",
  };
}

/**
 * Latest snapshot per (market, month), SUMMED per month across source markets
 * (rows MUST be period_start desc, as_of desc). Single-source markets behave as
 * before; a multi-source market's rows collapse into combined months.
 */
function latestRateMonths(rows: Record<string, unknown>[]): RateMonth[] {
  // First row seen per (market, month) is that source's latest as_of.
  const seen = new Set<string>();
  const byMonth = new Map<string, RateMonth>();
  for (const r of rows) {
    const ps = String(r.period_start);
    const key = `${String(r.market ?? "")}|${ps}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const acc = byMonth.get(ps);
    // NULL net is UNKNOWN, not zero — see RateMonth.net. `Number(null) || 0`
    // is what turned an unmeasured market into a confident $0.
    const net = r.net_sales == null ? null : Number(r.net_sales) || 0;
    const issued = Number(r.issued) || 0;
    const sales = Number(r.sales) || 0;
    const leads = Number(r.leads) || 0;
    const rawLeads = r.raw_leads_in == null ? null : Number(r.raw_leads_in) || 0;
    // Denominators only count where this source actually reported a net.
    const issuedNet = net == null ? 0 : issued;
    const salesNet = net == null ? 0 : sales;
    if (acc) {
      if (net != null) acc.net = (acc.net ?? 0) + net;
      acc.issued += issued;
      acc.sales += sales;
      acc.leads += leads;
      acc.issuedNet = (acc.issuedNet ?? 0) + issuedNet;
      acc.salesNet = (acc.salesNet ?? 0) + salesNet;
      if (rawLeads != null) acc.rawLeads = (acc.rawLeads ?? 0) + rawLeads;
    } else {
      byMonth.set(ps, { period_start: ps, net, issued, sales, leads, issuedNet, salesNet, rawLeads });
    }
  }
  return [...byMonth.values()]; // desc month order preserved from the query
}

/**
 * Trailing NSLI + NET average sale for a market as of `anchorMonth` (first-of-month),
 * with the min-sample window rule and company-wide fallback. One query for the
 * market's source codes (summed), one for the company (REECE) —
 * skipped when the market IS the company.
 */
export async function getTrailingRates(
  sb: Sb,
  market: string,
  anchorMonth: string,
): Promise<TrailingRates> {
  const live = anchorMonth === firstOfMonthET();
  const rateOpts = live ? { windowStart: rolling90WindowStart() } : undefined;
  const query = (codes: readonly string[]) => {
    let q = sb
      .from("lp_market_scorecard_daily")
      .select("market, net_sales, issued, sales, leads, raw_leads_in, period_start, as_of_date")
      .in("market", codes as string[]);
    // Strictly BEFORE the anchor in both cases now. The live branch used to
    // include the anchor month so "the rates move daily as data lands" — but
    // what landed daily was issued without its net. See computeTrailingRates.
    q = q.lt("period_start", anchorMonth);
    return q
      .order("period_start", { ascending: false })
      .order("as_of_date", { ascending: false })
      .limit(800);
  };

  if (market === "REECE") {
    const { data } = await query(["REECE"]);
    const months = latestRateMonths((data ?? []) as Record<string, unknown>[]);
    return computeTrailingRates(months, months, rateOpts);
  }

  const sources = marketSources(market);
  const [mkt, company] = await Promise.all([query(sources), query(["REECE"])]);
  return computeTrailingRates(
    latestRateMonths((mkt.data ?? []) as Record<string, unknown>[]),
    latestRateMonths((company.data ?? []) as Record<string, unknown>[]),
    rateOpts,
  );
}

/**
 * PERIOD-SCOPED rate anchor (the "D3" fix): rates price a period from the
 * months strictly BEFORE that period's first month.
 *
 *   • The period's own (possibly partial) months are never included — a
 *     period's performance must not move its own goal (circularity).
 *   • Start-anchoring makes a period's targets stable no matter when it is
 *     viewed: June's rates seen in August are June's rates as they stood
 *     entering June.
 *   • MTD (anchors at this month) and YTD (anchors at January) therefore
 *     price with DIFFERENT windows — both reprice when the period changes.
 *
 * No resolved period → the current ET month (the pre-D3 behavior, kept for
 * callers that plan the current month, e.g. the goal editor).
 */
export function resolveRateAnchor(resolved?: ResolvedPeriod): {
  anchorMonth: string;
  periodScoped: boolean;
} {
  if (!resolved?.periodStart) return { anchorMonth: firstOfMonthET(), periodScoped: false };
  return { anchorMonth: `${resolved.periodStart.slice(0, 7)}-01`, periodScoped: true };
}

function pts(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

/** Per-day targets + full-period totals, computed upstream (additive by office). */
type ResolvedTargets = { perDay: PerDayTargets; totals: TargetTotals };

function derive(
  actuals: ScorecardActuals,
  goals: ScorecardGoals,
  goalMeta: ScorecardDerived["goal"],
  targets: ResolvedTargets,
  periodGoalOverride?: number | null,
  periodGoalFull?: number | null,
  rates?: TrailingRates,
  anchor?: { anchorMonth: string; periodScoped: boolean },
  /** Σ of the units' revenue-anchored to-date goals (aggregate periods only). */
  revenueGoalOverride?: number | null,
  /** Calendar-derived elapsed selling days for the single-month path. */
  elapsedOverride?: number | null,
  /** Selling days elapsed through `revenue_as_of` (single-month path). */
  revenueElapsedOverride?: number | null,
): ScorecardDerived {
  const avgSaleTarget = rates?.avgSale ?? null;
  // Selling-day basis (both sides): the FULL period's selling days for target
  // proration, elapsed COMPLETED selling days for actual pace. "Today" is never
  // an elapsed day (the writer/aggregator already exclude it).
  const periodDays =
    actuals.period_working_days ?? actuals.working_days_in_period ?? goals.working_days ?? 0;
  // Prefer the calendar-derived count; fall back to the snapshot only when no
  // resolved period was supplied (period-less reads).
  const elapsed = elapsedOverride ?? actuals.days_elapsed ?? 0;
  // Aggregate periods (3 Months / YTD) sum the frozen monthly goals in range;
  // single-month snapshots prorate the live monthly goal by elapsed selling days.
  const mtd_goal_dollars =
    periodGoalOverride != null
      ? Math.round(periodGoalOverride)
      : Math.round(prorateGoal(goals.monthly_goal_dollars, elapsed, periodDays) ?? 0);
  // THE REVENUE TARGET. Released dollars are knowable only through the Net
  // Report's coverage date, so the target they are measured against prorates to
  // that same date — never to the period end, and never to the (later) date the
  // COUNTS reach. Falls back to the count target when no revenue date exists, so
  // a period with no report behaves exactly as before. See docs/revenue-as-of.md.
  const revenue_goal_to_date_dollars =
    revenueGoalOverride != null
      ? Math.round(revenueGoalOverride)
      : revenueElapsedOverride != null
        ? Math.round(prorateGoal(goals.monthly_goal_dollars, revenueElapsedOverride, periodDays) ?? 0)
        : mtd_goal_dollars;
  // Full (unprorated) goal for the whole period. Aggregate → Σ of every month's
  // goal in range; single month → the month's goal. Never the current-month goal
  // alone for a multi-month view.
  const period_goal_dollars =
    periodGoalFull != null ? Math.round(periodGoalFull) : goals.monthly_goal_dollars;

  // Consistency signal (surface, don't reconcile): the goal-anchored sales target
  // (goal ÷ avg sale) and the funnel-flow sales (demos × close%) should land in the
  // same neighborhood. A material gap means the office's demo%/close%/NSLI/avg-sale
  // assumptions are internally inconsistent.
  const closed_via_flow = targets.totals.demoed != null
    ? targets.totals.demoed * (goals.target_close_pct / 100)
    : null;
  const sales_target_divergence_pct =
    targets.totals.closed != null && closed_via_flow != null && closed_via_flow > 0
      ? Math.round((Math.abs(targets.totals.closed - closed_via_flow) / closed_via_flow) * 1000) / 10
      : null;

  return {
    monthly_goal_dollars: goals.monthly_goal_dollars,
    period_goal_dollars,
    mtd_goal_dollars,
    revenue_goal_to_date_dollars,
    avg_sale_target: avgSaleTarget ?? null,
    rate_window: rates?.window ?? null,
    rate_sample_n: rates?.sampleN ?? null,
    rate_anchor_month: anchor?.anchorMonth ?? null,
    rate_period_scoped: anchor?.periodScoped ?? false,
    sales_target_divergence_pct,
    target_leads_per_day: targets.perDay.leadsPerDay,
    target_issued_per_day: targets.perDay.issuedPerDay,
    target_demoed_per_day: targets.perDay.demoedPerDay,
    target_closed_per_day: targets.perDay.closedPerDay,
    // Leads = raw leads in (true top-of-funnel; ruled 2026-08-05). The `leads`
    // column is the appointment-set cohort (== sets) and stays off the display.
    actual_leads_per_day:
      actuals.raw_leads_in == null ? null : perDayActual(actuals.raw_leads_in, elapsed),
    actual_issued_per_day: perDayActual(actuals.issued, elapsed),
    actual_demoed_per_day: perDayActual(actuals.demos, elapsed),
    actual_closed_per_day: perDayActual(actuals.sales, elapsed),
    variance: {
      dollars: Math.round((actuals.net_sales ?? 0) - mtd_goal_dollars), // ⚠ TIE-OUT
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
 * Actuals snapshot for a market and RESOLVED period, joined to its editable
 * goals, with goal/pace/variance derived at read time.
 *
 * The query is bounded to the resolved period on BOTH sides:
 *   • `period_start` must equal the resolved period's start — a stale prior-month
 *     row can never render under the current month's label (the old "25 elapsed
 *     days in August" bug: the newest row in the warehouse was July's).
 *   • `as_of_date` ≤ the resolved as-of.
 * Returns null when no row matches (job hasn't run for this period yet — the
 * page shows an explicit empty state instead of silently showing old data).
 *
 * Multi-source display markets (Fort Lauderdale) fetch every
 * source's latest row and sum them via the aggregation core.
 */
export async function getScorecard(
  market = "REECE",
  resolved?: ResolvedPeriod,
): Promise<ScorecardView | null> {
  const sb = await lpServer();
  const sources = marketSources(market);

  let q = sb
    .from("lp_market_scorecard_daily")
    .select("*")
    .in("market", sources as string[])
    .order("as_of_date", { ascending: false })
    .limit(sources.length * 40);
  if (resolved) {
    q = q.eq("period_start", resolved.periodStart).lte("as_of_date", resolved.asOf);
  }

  const { data: actualsRows, error: actualsErr } = await q;
  if (actualsErr) throw actualsErr;
  const rows = (actualsRows ?? []) as (ScorecardActuals & Record<string, unknown>)[];

  // Latest row per source market (rows are as_of desc).
  const latest = new Map<string, ScorecardActuals & Record<string, unknown>>();
  for (const r of rows) {
    if (!latest.has(String(r.market))) latest.set(String(r.market), r);
  }
  if (latest.size === 0) return null;

  const latestRows = [...latest.values()];
  let actuals: ScorecardActuals;
  if (latestRows.length === 1) {
    actuals = latestRows[0] as ScorecardActuals;
  } else {
    // Combine the source rows (Orlando): sum numerators, re-derive ratios. Days
    // come from the freshest source; "as of" is the most conservative (oldest)
    // so the stamp never overstates freshness.
    const daysElapsed = Math.max(...latestRows.map((r) => Number(r.days_elapsed) || 0));
    const workingDays = Math.max(...latestRows.map((r) => Number(r.working_days_in_period) || 0));
    const asOf = latestRows.map((r) => String(r.as_of_date)).sort()[0] ?? "";
    actuals = aggregateActuals(latestRows, {
      market,
      periodStart: resolved?.periodStart ?? String(latestRows[0]?.period_start ?? ""),
      periodEnd: resolved?.asOf ?? String(latestRows[0]?.period_end ?? ""),
      asOf,
      daysElapsed,
      workingDays,
      periodWorkingDays: workingDays,
      reconciled: latestRows.every((r) => r.reconciled === true),
    });
  }

  return buildView(sb, market, actuals, resolved);
}

/** Goal row fields the derived-goal math needs (full row is fetched). */
type LiveGoalRow = ScorecardGoals & Record<string, unknown>;

/**
 * Prior-months bundle: latest snapshot per (market, month), kept PER SOURCE code
 * so baselines/rates can be computed for any display market or office without
 * re-querying. One query serves the whole view build.
 */
export async function fetchPriorMonthsBySource(
  sb: Sb,
  codes: readonly string[],
  anchorMonth: string,
  opts?: { includeAnchorMonth?: boolean },
): Promise<Map<string, RateMonth[]>> {
  // Live anchor (rolling-90-day rates): the anchor month's own MTD row joins
  // the window so the rates move daily as data lands. Historical anchors stay
  // strictly-before (a frozen period must not reprice from its own months).
  // Growth baselines are unaffected either way — computeBaselineFromRows
  // filters period_start < periodStart itself.
  let q = sb
    .from("lp_market_scorecard_daily")
    .select("market, net_sales, issued, sales, leads, raw_leads_in, period_start, as_of_date")
    .in("market", codes as string[]);
  q = opts?.includeAnchorMonth ? q.lte("period_start", anchorMonth) : q.lt("period_start", anchorMonth);
  const { data } = await q
    .order("period_start", { ascending: false })
    .order("as_of_date", { ascending: false })
    .limit(4000);
  const out = new Map<string, RateMonth[]>();
  const seen = new Set<string>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const mkt = String(r.market ?? "");
    const ps = String(r.period_start);
    const key = `${mkt}|${ps}`;
    if (seen.has(key)) continue; // first hit per (market, month) = latest as_of
    seen.add(key);
    const list = out.get(mkt) ?? [];
    // NULL net is UNKNOWN, not zero — see RateMonth.net. This also reaches the
    // growth baseline via rateMonthsToBaselineRows: computeBaselineFromRows
    // already skips `net_sales == null`, so a month nobody measured stops
    // presenting as a real $0 baseline month.
    const netP = r.net_sales == null ? null : Number(r.net_sales) || 0;
    const issuedP = Number(r.issued) || 0;
    const salesP = Number(r.sales) || 0;
    list.push({
      period_start: ps,
      net: netP,
      issued: issuedP,
      sales: salesP,
      leads: Number(r.leads) || 0,
      issuedNet: netP == null ? 0 : issuedP,
      salesNet: netP == null ? 0 : salesP,
      rawLeads: r.raw_leads_in == null ? null : Number(r.raw_leads_in) || 0,
    });
    out.set(mkt, list);
  }
  return out;
}

/** Sum several sources' month lists into one combined list (desc month order). */
export function combineRateMonths(lists: RateMonth[][]): RateMonth[] {
  const byMonth = new Map<string, RateMonth>();
  for (const list of lists) {
    for (const m of list) {
      const acc = byMonth.get(m.period_start);
      if (acc) {
        if (m.net != null) acc.net = (acc.net ?? 0) + m.net;
        acc.issued += m.issued;
        acc.sales += m.sales;
        acc.leads += m.leads;
        acc.issuedNet = (acc.issuedNet ?? 0) + (m.issuedNet ?? (m.net == null ? 0 : m.issued));
        acc.salesNet = (acc.salesNet ?? 0) + (m.salesNet ?? (m.net == null ? 0 : m.sales));
        // rawLeads: null = untracked; Σ of the sources that carry it.
        if (m.rawLeads != null) acc.rawLeads = (acc.rawLeads ?? 0) + m.rawLeads;
      } else {
        byMonth.set(m.period_start, { ...m });
      }
    }
  }
  return [...byMonth.values()].sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
}

/**
 * Merge an actuals row with its editable goals + derived goal/pace/variance into a
 * ScorecardView. Shared by every sourcing path (stored snapshot, LP recompute
 * preview, multi-month aggregate) so they render identically.
 *
 * Two structural invariants live here (not in the DB):
 *   • The company (REECE) goal is DERIVED ON READ — always the Σ of the office
 *     goals. The stored REECE rows are never trusted for dollar goals.
 *   • Company per-day pace targets are the Σ of the per-office target chains
 *     (each office's period goal ÷ its own NSLI), never company goal ÷ blended
 *     NSLI. A multi-source market's chain runs on its combined data.
 */
async function buildView(
  sb: Sb,
  market: string,
  actuals: ScorecardActuals,
  resolved?: ResolvedPeriod,
): Promise<ScorecardView> {
  const isCompany = market === "REECE";
  const displaySources = marketSources(market);
  const cal = resolveSellingCalendar();
  // The GROWTH-MODE BASELINE stays period-scoped (D3): a period's own months
  // must never move its own dollar goal. The anchor below feeds the baseline
  // and is reported for transparency.
  const anchor = resolveRateAnchor(resolved);

  const goalCodes = isCompany ? ["REECE", ...OFFICE_SOURCE_CODES] : [...displaySources];
  const priorCodes = isCompany
    ? ["REECE", ...OFFICE_SOURCE_CODES]
    : [...new Set([...displaySources, "REECE"])];

  // RATES ARE ROLLING-90-DAY, EVERYWHERE (ruled 2026-08-05 §7).
  //
  // NSLI / average sale / issue rate previously used the rolling window only
  // when the view's anchor happened to be the current month, so the scorecard
  // header showed a YTD-anchored trailing-3 NSLI ($3,599) while the goal
  // editor — which always plans the current month — showed the rolling-90-day
  // one ($3,888). Two different numbers for one labeled quantity. They are
  // conversion ratios, not period totals: the current 90 days is the honest
  // basis for turning a dollar goal into funnel targets, whichever period is
  // being viewed. The window and its sample size are labeled on the tile.
  //
  // Months are therefore always fetched through the CURRENT month; the
  // baseline resolver ignores months at/after its own anchor, so widening the
  // fetch cannot leak a period's own performance into its dollar goal.
  const rateAnchorMonth = firstOfMonthET();
  // The fetch still pulls the anchor month — computeBaselineFromRows needs the
  // full list and filters for itself — but the RATE window excludes it: the
  // live month is issued-without-net and depresses NSLI. See
  // computeTrailingRates, and the maturation-lag follow-up noted there.
  const rateOpts = { windowStart: rolling90WindowStart(), excludeFrom: rateAnchorMonth };

  const [{ data: goalsRows }, prior] = await Promise.all([
    sb.from("scorecard_goals").select("*").in("market", goalCodes),
    fetchPriorMonthsBySource(sb, priorCodes, rateAnchorMonth, { includeAnchorMonth: true }),
  ]);
  const goalsBySource = new Map<string, LiveGoalRow>();
  for (const g of (goalsRows ?? []) as LiveGoalRow[]) goalsBySource.set(g.market, g);

  // Percent targets / working days come from the scope's own row (REECE row for
  // the company view, primary source row for a market view); dollar goals are
  // always summed from the offices below.
  const primaryGoals =
    (isCompany ? goalsBySource.get("REECE") : goalsBySource.get(displaySources[0] ?? market)) ??
    (goalsRows?.[0] as LiveGoalRow | undefined) ??
    DEFAULT_GOALS(market);

  const companyMonths = prior.get("REECE") ?? [];
  const monthsFor = (srcs: readonly string[]): RateMonth[] =>
    srcs.length === 1 ? prior.get(srcs[0] ?? "") ?? [] : combineRateMonths(srcs.map((s) => prior.get(s) ?? []));

  const baselineFor = (srcs: readonly string[], atMonth: string) =>
    computeBaselineFromRows(rateMonthsToBaselineRows(monthsFor(srcs)), atMonth);

  // A market's PRIMARY source row carries the WHOLE market's goal, so a primary
  // row in growth mode resolves against the COMBINED display-market baseline —
  // FTLAU at +15% means "Fort Lauderdale grows 15% over the FTLAU+BOCA+MIAMI+
  // RFED baseline", not over one branch's slice. Since Lakeland became its own
  // market (2026-08-06) every market is 1:1 with its code except Fort
  // Lauderdale, whose sources arrive pre-folded upstream — so this map is
  // effectively identity today. It stays because the merge is a real upstream
  // possibility, and per-source resolution on a non-primary row is what stops a
  // combined baseline being double-counted.
  const growthBaselineSources = new Map<string, readonly string[]>();
  for (const m of SCORECARD_MARKETS) growthBaselineSources.set(m.sources[0] ?? m.code, m.sources);

  /** Live effective $ goal for ONE source code (growth mode resolved per the rule above). */
  const liveEffectiveFor = (src: string, atMonth: string): number => {
    const row = goalsBySource.get(src);
    if (!row) return 0;
    if (row.goal_mode === "growth_pct" && row.growth_pct != null) {
      const baseSrcs = growthBaselineSources.get(src) ?? [src];
      return Math.round(baselineFor(baseSrcs, atMonth).value * (1 + Number(row.growth_pct) / 100));
    }
    return Number(row.monthly_goal_dollars) || 0;
  };

  // Effective monthly goal for the viewed scope. Company = Σ offices (derived on
  // read — the stored REECE row is ignored for dollars). Multi-source markets =
  // Σ their sources (Fort Lauderdale = its folded branch goal rows).
  const effectiveGoal = (isCompany ? OFFICE_SOURCE_CODES : displaySources).reduce(
    (a, c) => a + liveEffectiveFor(c, actuals.period_start),
    0,
  );

  const baseline = baselineFor(isCompany ? ["REECE"] : displaySources, actuals.period_start);

  // Displayed trailing rates (KPI NSLI / average sale) for the viewed scope. The
  // company KPI is the blended company rate — fine for DISPLAY; targets below
  // never use it.
  const trailingRates = computeTrailingRates(
    monthsFor(isCompany ? ["REECE"] : displaySources),
    companyMonths,
    rateOpts,
  );
  const rates: TrailingRates = trailingRates;
  const effectiveGoals: ScorecardGoals = {
    ...primaryGoals,
    market,
    monthly_goal_dollars: effectiveGoal,
    // COMPUTED only. The stored scorecard_goals.trailing_nsli column is a
    // write-through cache (saveScorecardGoals refreshes it) and is NEVER read
    // — no history in the window means null (renders "—" + the widened flag),
    // never a stale stored number (ruled 2026-08-04).
    trailing_nsli: rates.nsli,
  };

  // ── period goals, per target unit (each display market, or just this one) ──
  // Unit = a display market's source codes. The company is the Σ of the units, so
  // company figures are additive by construction.
  const units: readonly (readonly string[])[] = isCompany
    ? SCORECARD_MARKETS.map((m) => m.sources)
    : [displaySources];

  // Growth-mode frozen rows resolve their baseline under the same primary-
  // source rule as live rows.
  const baselineForSource = (src: string, atMonth: string) =>
    baselineFor(growthBaselineSources.get(src) ?? [src], atMonth);

  const isAggregate = resolved?.source === "aggregate";
  const unitGoals = isAggregate
    ? await Promise.all(
        units.map((srcs) =>
          resolvePeriodGoalForSources(
            sb,
            srcs,
            resolved!,
            cal,
            liveEffectiveFor,
            baselineForSource,
            actuals.revenue_as_of,
          ),
        ),
      )
    : units.map((srcs) => ({
        toDate: null as number | null,
        full: srcs.reduce((a, c) => a + liveEffectiveFor(c, actuals.period_start), 0),
        revenueToDate: null as number | null,
        estimated: false,
      }));

  const periodGoalFull = unitGoals.reduce((a, u) => a + u.full, 0);
  const periodGoalToDate = isAggregate
    ? unitGoals.reduce((a, u) => a + (u.toDate ?? 0), 0)
    : null;
  const revenueGoalToDate = isAggregate
    ? unitGoals.reduce((a, u) => a + (u.revenueToDate ?? 0), 0)
    : null;
  const estimated = unitGoals.some((u) => u.estimated);

  // ── elapsed-day anchors for the single-month (snapshot) path ──
  // Both are CALENDAR facts. `actuals.days_elapsed` is written by the LP-MCP daily
  // job and frozen at that snapshot's as_of_date, so a stalled feed shrinks the
  // target in step with the missing actuals and a real miss renders as on-pace.
  // The view model already refuses to display that number for the same reason;
  // the goal it is compared against has to use the same anchor or the two
  // disagree — which is exactly how the panel came to read "8 / 26 elapsed"
  // beside a $700,000 (7/26) Fort Myers target. See docs/revenue-as-of.md.
  const countElapsedOverride =
    resolved && !isAggregate ? sellingDaysElapsed(actuals.period_start, resolved.asOf, cal) : null;
  // Revenue reaches only as far as the Net Report covers, and never past the
  // period's own as-of.
  const revenueAnchor =
    resolved && !isAggregate ? revenueAnchorDate(resolved.asOf, actuals.revenue_as_of) : null;
  const revenueElapsedOverride =
    revenueAnchor == null ? null : sellingDaysElapsed(actuals.period_start, revenueAnchor, cal);

  // ── per-day pace targets: one NSLI chain per unit, then Σ ──
  const periodDays =
    actuals.period_working_days ?? actuals.working_days_in_period ?? primaryGoals.working_days ?? 0;
  const unitChains = units.map((srcs, i) => {
    const uRates = computeTrailingRates(monthsFor(srcs), companyMonths, rateOpts);
    const demoPct = Number(
      goalsBySource.get(srcs[0] ?? "")?.target_demo_pct ?? primaryGoals.target_demo_pct ?? 70,
    );
    return targetTotals({
      periodGoal: unitGoals[i]?.full ?? 0,
      nsli: uRates.nsli,
      avgSale: uRates.avgSale,
      targetDemoPct: demoPct,
    });
  });
  const targets: ResolvedTargets = {
    totals: sumTargetTotals(unitChains),
    perDay: sumPerDayTargets(unitChains.map((c) => perDayTargets(c, periodDays))),
  };

  const goalMeta: ScorecardDerived["goal"] = {
    mode: primaryGoals.goal_mode,
    growth_pct: primaryGoals.growth_pct,
    baseline_net_sales: baseline.source === "none" ? null : baseline.value,
    baseline_source: baseline.source,
    effective_monthly_goal: effectiveGoal,
    estimated,
  };

  return {
    actuals,
    goals: effectiveGoals,
    derived: derive(
      actuals,
      effectiveGoals,
      goalMeta,
      targets,
      periodGoalToDate,
      isAggregate ? periodGoalFull : null,
      rates,
      anchor,
      revenueGoalToDate,
      countElapsedOverride,
      revenueElapsedOverride,
    ),
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
 * Period goal for an aggregate range = Σ over each month × each SOURCE market of
 * the goal in force that month, with the month containing `asOf` prorated by
 * elapsed selling days (the shared prorateGoal helper). Prefers the frozen
 * scorecard_goals_monthly row per (source, month); falls back to that source's
 * live effective goal (flagged `estimated`) when a month has no frozen row.
 *
 * Summing per source makes a multi-source market and the company (Σ all offices)
 * exact sums of their parts — the stored REECE frozen rows are never used.
 */
async function resolvePeriodGoalForSources(
  sb: Sb,
  sources: readonly string[],
  resolved: ResolvedPeriod,
  cal: SellingCalendar,
  liveEffectiveFor: (src: string, atMonth: string) => number,
  baselineForSource: (src: string, atMonth: string) => { value: number },
  /**
   * Coverage end date of the month's Net Report (`revenue_as_of`), or null when
   * no report has landed. The REVENUE target prorates to this date instead of
   * `resolved.asOf`: released dollars are only knowable through the last report,
   * so measuring them against a target that reaches further is understated by
   * construction. See docs/revenue-as-of.md.
   */
  revenueAsOf: string | null,
): Promise<{ toDate: number; full: number; revenueToDate: number; estimated: boolean }> {
  const months = monthsInRange(resolved.periodStart, resolved.periodEnd);

  const { data: frozenRows } = await sb
    .from("scorecard_goals_monthly")
    .select("*")
    .in("market", sources as string[])
    .in("goal_month", months);
  const frozen = new Map<string, ScorecardMonthlyGoal>();
  for (const r of (frozenRows ?? []) as ScorecardMonthlyGoal[]) {
    frozen.set(`${r.market}|${String(r.goal_month).slice(0, 10)}`, r);
  }

  // `total` = Target to Date (current month prorated). `periodTotal` = Period Goal
  // (every month in range counted in full, unprorated). `revenueTotal` is the same
  // shape as `total` but anchored to the revenue watermark.
  let total = 0;
  let periodTotal = 0;
  let revenueTotal = 0;
  let estimated = false;

  const revenueAnchor = revenueAnchorDate(resolved.asOf, revenueAsOf);
  for (const monthStart of months) {
    const y = Number(monthStart.slice(0, 4));
    const mo = Number(monthStart.slice(5, 7));
    const monthEnd = new Date(Date.UTC(y, mo, 0, 12, 0, 0)).toISOString().slice(0, 10);

    // Full-month dollar goal for this month = Σ over the source markets.
    let monthGoal = 0;
    for (const src of sources) {
      const row = frozen.get(`${src}|${monthStart}`);
      if (row) {
        monthGoal +=
          row.goal_mode === "growth_pct" && row.growth_pct != null
            ? Math.round(baselineForSource(src, monthStart).value * (1 + row.growth_pct / 100))
            : Number(row.goal_dollars) || 0;
      } else {
        monthGoal += liveEffectiveFor(src, monthStart);
        estimated = true;
      }
    }

    // Period Goal counts every month in range at full.
    periodTotal += monthGoal;

    // Target to Date: prorate the month that contains the anchor; fully-elapsed
    // months count in full; months entirely after the anchor contribute nothing.
    // Identical shape for both anchors — only the date differs, so the count
    // target and the revenue target can never drift apart in their math.
    const toDateAt = (anchor: string): number => {
      if (anchor >= monthEnd) return monthGoal;
      if (anchor < monthStart) return 0;
      const wd = sellingDaysInPeriod(monthStart, monthEnd, cal);
      const elapsed = sellingDaysElapsed(monthStart, anchor, cal);
      return prorateGoal(monthGoal, elapsed, wd) ?? 0;
    };
    total += toDateAt(resolved.asOf);
    revenueTotal += toDateAt(revenueAnchor);
  }
  return {
    toDate: Math.round(total),
    full: Math.round(periodTotal),
    revenueToDate: Math.round(revenueTotal),
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
    revenue_as_of: raw.revenue_as_of == null ? null : String(raw.revenue_as_of),
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
    rtp_gross_dollars: n(raw.rtp_gross_dollars),
    net_sales: n(raw.net_sales),
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
    return getScorecard(market, resolved);
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

/** REECE + every office source code the editor manages (derived from the single
 *  market source of truth — Lakeland is one of them, editable in its own right
 *  since 2026-08-06). */
export const EDITOR_MARKETS: readonly string[] = ["REECE", ...OFFICE_SOURCE_CODES];

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
  /** CALCULATED trailing NET average sale — the closed-per-day divisor (goal ÷
   *  avg sale), matching the server pace chain exactly. */
  avgSale: number | null;
  /** Which trailing window produced the NSLI, and the sales-count sample behind it —
   *  surfaced so a small-market figure is explainable. */
  rateWindow: RateWindow | null;
  rateSampleN: number;
};

/** Latest distribution run per month (audit row summary for the editor UI). */
export type GoalDistributionSummary = {
  distributionId: string;
  companyGoalCents: number;
  basis: string;
  createdAt: string;
  /** display-market code → allocated cents (the run's full allocation map). */
  allocations: Record<string, number>;
};

export type ScorecardGoalsEditorData = {
  markets: MarketGoalEntry[];
  /** Frozen per-month rows for all editor markets — repopulates the form per month. */
  monthly: ScorecardMonthlyGoal[];
  /** Month options (first-of-month, newest first). */
  months: string[];
  /** Current month, first-of-month — the default freeze target. */
  defaultMonth: string;
  /** Top-down distribution state. `available` is false until migration 0017 is
   *  applied (the distributor UI hides itself — graceful pre-migration). */
  distributions: {
    available: boolean;
    latestByMonth: Record<string, GoalDistributionSummary>;
  };
};

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

  // Month options = the current ET year, January through the current ET month,
  // newest first (e.g. in July: Jul, Jun, … Jan). No future or prior-year months.
  const months = yearToDateMonthsET();
  const defaultMonth = months[0] ?? firstOfMonthET();

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
      // Primary source rows (and REECE) resolve growth against their display
      // market's combined baseline; any secondary row resolves per-source, so a
      // merged market's whole goal lives on the primary row without
      // double-counting. Every market is its own primary today — Lakeland
      // included (ruling 2026-08-06).
      const isPrimary =
        market === "REECE" || SCORECARD_MARKETS.some((m) => (m.sources[0] ?? m.code) === market);
      const [baseline, rates] = await Promise.all([
        getBaselineNetSales(sb, market, defaultMonth, isPrimary ? undefined : [market]),
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
        avgSale: rates.avgSale,
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

  // Latest distribution run per month. A failed read (table absent — migration
  // 0017 not applied yet) degrades to available:false and hides the distributor.
  const distributions: ScorecardGoalsEditorData["distributions"] = {
    available: false,
    latestByMonth: {},
  };
  try {
    const { data: distRows, error: distErr } = await sb
      .from("scorecard_goal_distributions")
      .select("distribution_id, goal_month, company_goal_cents, basis, allocations, created_at")
      .in("goal_month", months)
      .order("created_at", { ascending: false });
    if (!distErr) {
      distributions.available = true;
      for (const r of (distRows ?? []) as Record<string, unknown>[]) {
        const month = String(r.goal_month).slice(0, 10);
        if (!distributions.latestByMonth[month]) {
          distributions.latestByMonth[month] = {
            distributionId: String(r.distribution_id),
            companyGoalCents: Number(r.company_goal_cents) || 0,
            basis: String(r.basis ?? "trailing_net"),
            createdAt: String(r.created_at ?? ""),
            allocations: (r.allocations ?? {}) as Record<string, number>,
          };
        }
      }
    }
  } catch {
    // graceful pre-migration: distributor stays hidden
  }

  return { markets, monthly, months, defaultMonth, distributions };
}
