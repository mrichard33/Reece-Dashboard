import { lpServer } from "@/lib/supabase/lp";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
} from "@/lib/date/sellingDays";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import type { ScorecardActuals } from "@/lib/queries/scorecard";
import {
  aggregateActuals,
  type MonthlySnapshotRow,
} from "@/lib/queries/scorecardAggregate.core";
import { composeReportHeroNet, type HeroMonthRow } from "@/lib/scorecard/reportRtp";

/**
 * DB wrapper for the pure aggregator (scorecardAggregate.core). Queries the stored
 * monthly snapshots in the resolved range and aggregates them: latest snapshot per
 * month → sum numerators → ratios re-derived. See the core for the math.
 *
 * Goal proration note: the goal model is monthly. days_elapsed = selling days
 * across the whole range and working_days_in_period = selling days in the anchor
 * (first) month, so the read layer's mtd_goal = monthly_goal × (range ÷ month) ≈
 * monthly_goal × months elapsed — a sensible "goal to date" for QTD/YTD.
 */
export { aggregateActuals } from "@/lib/queries/scorecardAggregate.core";

export async function getAggregateActuals(
  market: string,
  resolved: ResolvedPeriod,
): Promise<ScorecardActuals | null> {
  const sb = await lpServer();
  const cal = resolveSellingCalendar();

  const { data, error } = await sb
    .from("lp_market_scorecard_daily")
    .select("*")
    .eq("market", market)
    .gte("period_start", resolved.periodStart)
    .lte("period_start", resolved.periodEnd)
    .order("as_of_date", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as MonthlySnapshotRow[];
  if (!rows.length) return null;

  const daysElapsed = sellingDaysElapsed(resolved.periodStart, resolved.asOf, cal);
  const anchorMonthStart = `${resolved.periodStart.slice(0, 7)}-01`;
  const ay = Number(anchorMonthStart.slice(0, 4));
  const am = Number(anchorMonthStart.slice(5, 7));
  const anchorMonthEnd = new Date(Date.UTC(ay, am, 0, 12, 0, 0)).toISOString().slice(0, 10);
  // Anchor-month selling days — the per-day funnel-target basis (unchanged).
  const workingDays = sellingDaysInPeriod(anchorMonthStart, anchorMonthEnd, cal);
  // Selling days in the ENTIRE selected period (whole year for YTD, whole quarter
  // for QTD, the month for a single-month aggregate). This is what the
  // WORKING/ELAPSED tile, elapsed-% and projected pace expand to.
  const [fullStart, fullEnd] = fullPeriodBounds(resolved);
  const periodWorkingDays = sellingDaysInPeriod(fullStart, fullEnd, cal);

  const reconciled = rows.every((r) => r.reconciled === true);

  const actuals = aggregateActuals(rows, {
    market,
    periodStart: resolved.periodStart,
    periodEnd: resolved.periodEnd,
    asOf: resolved.asOf,
    daysElapsed,
    workingDays,
    periodWorkingDays,
    reconciled,
  });

  // Bug 5 — report-sourced hero net. When a company aggregate spans the live
  // current month, the warehouse's legacy released figure for that month
  // overstates RTP; recompose the headline net from the closed months
  // (net_report_rtp) plus the report's exact RTP-to-date for the open month.
  const heroNet = composeReportHeroNet(latestPerMonth(rows), market);
  if (heroNet != null) actuals.released_dollars = heroNet;

  return actuals;
}

/** Latest snapshot per month (max as_of_date per period_start). */
function latestPerMonth(rows: MonthlySnapshotRow[]): HeroMonthRow[] {
  const latest = new Map<string, MonthlySnapshotRow>();
  for (const r of rows) {
    const prev = latest.get(r.period_start);
    if (!prev || String(r.as_of_date) > String(prev.as_of_date)) latest.set(r.period_start, r);
  }
  return [...latest.values()] as unknown as HeroMonthRow[];
}

/**
 * Natural full span of the selected period for the working-day denominator: the
 * whole YEAR for YTD, the whole QUARTER for QTD, the trailing months for 3-Month,
 * and the whole MONTH for a single-month aggregate (last_month / select_month).
 * Extends past `asOf` so "X% of period" reads as calendar progress, not 100%.
 */
function fullPeriodBounds(resolved: ResolvedPeriod): [string, string] {
  const start = resolved.periodStart;
  const y = Number(start.slice(0, 4));
  const monthEndOf = (ymd: string): string => {
    const yy = Number(ymd.slice(0, 4));
    const mm = Number(ymd.slice(5, 7));
    return new Date(Date.UTC(yy, mm, 0, 12, 0, 0)).toISOString().slice(0, 10);
  };
  switch (resolved.key) {
    case "ytd":
      return [`${y}-01-01`, `${y}-12-31`];
    case "qtd": {
      const qEndMonth = Number(start.slice(5, 7)) + 2; // quarter start month + 2
      return [start, monthEndOf(`${y}-${String(qEndMonth).padStart(2, "0")}-01`)];
    }
    case "trailing_3m":
      // Current + 2 prior full months → extend to the end of the current month.
      return [start, monthEndOf(resolved.periodEnd)];
    default:
      // Single-month aggregate (last_month / select_month): the whole month.
      return [start, monthEndOf(start)];
  }
}
