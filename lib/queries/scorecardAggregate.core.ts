import type { ScorecardActuals } from "@/lib/queries/scorecard";

/**
 * Pure aggregation core for multi-month scorecard periods (no DB imports, so it's
 * safe to unit-test in a plain node env). The DB wrapper lives in
 * lib/queries/scorecardAggregate.ts.
 *
 * Strategy: take the LATEST snapshot per month (max as_of_date per period_start)
 * so each month is counted once at its final state, SUM the count/$ numerators,
 * and RE-DERIVE every ratio from the summed numerators/denominators — never average
 * percentages (NSLI = Σreleased ÷ Σissued, not the mean of monthly NSLIs).
 */

export type MonthlySnapshotRow = {
  period_start: string;
  as_of_date: string;
  [k: string]: unknown;
};

export type AggregateCtx = {
  market: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  daysElapsed: number;
  workingDays: number;
  reconciled: boolean;
};

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
export function rate(numr: number, den: number): number | null {
  if (!den) return null;
  return Math.round((numr / den) * 1000) / 10;
}
export function money(numr: number, den: number): number | null {
  if (!den) return null;
  return Math.round(numr / den);
}

export function aggregateActuals(rows: MonthlySnapshotRow[], ctx: AggregateCtx): ScorecardActuals {
  // Keep the latest snapshot per month.
  const latestPerMonth = new Map<string, MonthlySnapshotRow>();
  for (const r of rows) {
    const prev = latestPerMonth.get(r.period_start);
    if (!prev || String(r.as_of_date) > String(prev.as_of_date)) {
      latestPerMonth.set(r.period_start, r);
    }
  }
  const months = [...latestPerMonth.values()];

  const sum = (field: string) => months.reduce((a, r) => a + num(r[field]), 0);
  const sumBucket = (field: string) =>
    months.reduce((a, r) => {
      const bt = (r.raw_inputs as { bucket_tally?: Record<string, unknown> } | null)?.bucket_tally;
      return a + num(bt?.[field]);
    }, 0);

  const leads = sum("leads");
  const sets = sum("sets");
  const issued = sum("issued");
  const net_issue = sum("net_issue");
  const demos = sum("demos");
  const sales = sum("sales");
  const net_close = sum("net_close");
  const ko_count = sum("ko_count");
  const gross_sales = sum("gross_sales");
  const released_dollars = sum("released_dollars");
  const working_dollars = sum("working_dollars");
  const other_pending = sumBucket("other_pending");
  const cancelled_dollars = sumBucket("cancelled_dollars");
  // Net (Good Business) = Σ of each month's stored net_sales (= good_business =
  // gross − cancellations). Summing the authoritative per-month figure is robust:
  // the pre-June-2026 EOM snapshots carry net_sales but NO released/working/other
  // bucket split, so deriving net from buckets (or gross − cancelled) would drop
  // those months. This keeps Net Sales / NSLI / Avg Sale consistent MTD → 3-Month
  // / YTD, matching the engine snapshot.
  const net_sales = sum("net_sales");
  const pending_total = working_dollars; // Pending = Working only
  const raw_leads_in = months.reduce((a, r) => a + num(r.raw_leads_in), 0);

  return {
    market: ctx.market,
    as_of_date: ctx.asOf,
    period_start: ctx.periodStart,
    period_end: ctx.periodEnd,
    days_elapsed: ctx.daysElapsed,
    working_days_in_period: ctx.workingDays,
    leads,
    issued,
    sets,
    demos,
    sales,
    net_issue,
    net_close,
    ko_count,
    good_business: net_sales,
    gross_sales,
    net_sales,
    released_dollars,
    working_dollars,
    pending_total,
    pending_dollars: pending_total,
    deposits: sum("deposits"),
    raw_leads_in,
    pct_issue: rate(issued, sets),
    demo_pct: rate(demos, net_issue),
    close_pct: rate(sales, demos),
    pct_net_close: rate(net_close, demos),
    good_rate_pct: rate(released_dollars, gross_sales),
    ko_pct: rate(ko_count, sales),
    gsli: money(gross_sales, issued),
    nsli: money(net_sales, issued),
    avg_sale: money(net_sales, net_close),
    reconciled: ctx.reconciled,
    // Seam marker across the aggregated months: report-sourced, live, or mixed.
    computed_from: (() => {
      const froms = months.map((r) => String(r.computed_from ?? "lp_api"));
      const hasReport = froms.includes("net_report_rtp");
      const hasLive = froms.some((f) => f !== "net_report_rtp");
      return hasReport && hasLive ? "mixed" : hasReport ? "net_report_rtp" : "lp_api";
    })(),
    created_at: null,
    raw_inputs: {
      revenue_basis: "aggregate (sum monthly snapshots, ratios re-derived)",
      raw_leads_basis: "Σ monthly raw_leads_in",
      months_aggregated: months.length,
      bucket_tally: {
        released_dollars,
        working_dollars,
        other_pending,
        cancelled_dollars,
      },
    },
  };
}
