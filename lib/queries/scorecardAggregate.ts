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
  const workingDays = sellingDaysInPeriod(anchorMonthStart, anchorMonthEnd, cal);

  const reconciled = rows.every((r) => r.reconciled === true);

  return aggregateActuals(rows, {
    market,
    periodStart: resolved.periodStart,
    periodEnd: resolved.periodEnd,
    asOf: resolved.asOf,
    daysElapsed,
    workingDays,
    reconciled,
  });
}
