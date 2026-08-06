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
import { firstOfMonthET } from "@/lib/date/sellingDays";
import { marketSources } from "@/lib/scorecard/markets";

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

  // A display market may span several warehouse source codes (Fort Lauderdale
  // = FTLAU + BOCA + MIAMI + RFED); the core sums per (market, month).
  const sources = marketSources(market);
  const { data, error } = await sb
    .from("lp_market_scorecard_daily")
    .select("*")
    .in("market", sources as string[])
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
  // Selling days in the ENTIRE selected period — the whole months the period
  // goal covers. This is what the WORKING/ELAPSED tile, elapsed-% and projected
  // pace expand to, and it MUST be the same window the goal was summed over.
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
  // Gated on the constant matching the current ET month — a stale constant
  // deactivates (with a console.error) instead of overriding with old data.
  const heroNet = composeReportHeroNet(latestPerMonth(rows), market, firstOfMonthET());
  if (heroNet != null) {
    actuals.released_dollars = heroNet;
    // Keep the Net (Good Business) breakdown's Released line on the same figure
    // as the hero — the bucket tally would otherwise shadow this override.
    if (actuals.raw_inputs?.bucket_tally) {
      actuals.raw_inputs.bucket_tally.released_dollars = heroNet;
    }
  }

  return actuals;
}

/** Latest snapshot per (market, month) — max as_of_date per source-month. */
function latestPerMonth(rows: MonthlySnapshotRow[]): HeroMonthRow[] {
  const latest = new Map<string, MonthlySnapshotRow>();
  for (const r of rows) {
    const key = `${String(r.market ?? "")}|${r.period_start}`;
    const prev = latest.get(key);
    if (!prev || String(r.as_of_date) > String(prev.as_of_date)) latest.set(key, r);
  }
  return [...latest.values()] as unknown as HeroMonthRow[];
}

/**
 * Natural full span of the selected period for the working-day denominator: the
 * whole YEAR for YTD, the whole QUARTER for QTD, the trailing months for 3-Month,
 * and the whole MONTH for a single-month aggregate (last_month / select_month).
 * Extends past `asOf` so "X% of period" reads as calendar progress, not 100%.
 */
export function fullPeriodBounds(resolved: ResolvedPeriod): [string, string] {
  const monthEndOf = (ymd: string): string => {
    const yy = Number(ymd.slice(0, 4));
    const mm = Number(ymd.slice(5, 7));
    return new Date(Date.UTC(yy, mm, 0, 12, 0, 0)).toISOString().slice(0, 10);
  };
  // ONE rule for every period key: the full period is the span of WHOLE MONTHS
  // that the period goal sums over — the start month through the end month.
  //
  // This used to be a per-key switch, and YTD returned [Jan 1, Dec 31]: a
  // twelve-month denominator against an eight-month goal. On 2026-08-06 that
  // rendered Projected Pace as 53,044,056 ÷ 183 × 305 = $88,406,760 — ABOVE a
  // $84.5M goal — while Balance correctly read −$22.5M on the same screen. Two
  // elapsed fractions, one screen. QTD had the same defect in the same
  // direction (it extended to the end of the quarter no matter how much of it
  // the goal covered); trailing_3m was already right, and is now the rule.
  //
  // With the goal window and the clock window forced to agree, target-to-date
  // and projected pace can no longer disagree by construction, and the §1
  // invariant — totalUnits never exceeds what the resolved period end implies —
  // holds for every key rather than being asserted key by key.
  //
  // Guard: on the first day of a period, before any selling day has completed,
  // periodEnd is the last completed day and so lands in the PREVIOUS month
  // (Aug 1 → Jul 31). Taking its month end would invert the range and report
  // zero total selling days — a division by zero dressed up as data. The period
  // still spans its own start month, so clamp to whichever end is later.
  const end = resolved.periodEnd >= resolved.periodStart ? resolved.periodEnd : resolved.periodStart;
  return [resolved.periodStart, monthEndOf(end)];
}
