import type { ScorecardActuals } from "@/lib/queries/scorecard";

/**
 * Pure aggregation core for multi-month scorecard periods (no DB imports, so it's
 * safe to unit-test in a plain node env). The DB wrapper lives in
 * lib/queries/scorecardAggregate.ts.
 *
 * Strategy: take the LATEST snapshot per (market, month) — max as_of_date per
 * (market, period_start) — so each month of each source market is counted once at
 * its final state, SUM the count/$ numerators, and RE-DERIVE every ratio from the
 * summed numerators/denominators — never average percentages (NSLI = Σreleased ÷
 * Σissued, not the mean of monthly NSLIs).
 *
 * Keying by (market, period_start) makes the same function serve two jobs:
 * multi-month aggregates (3-Month / YTD) AND multi-source display markets
 * (Fort Lauderdale's folded branch rows summed), including both at once.
 */

export type MonthlySnapshotRow = {
  period_start: string;
  as_of_date: string;
  market?: unknown;
  [k: string]: unknown;
};

export type AggregateCtx = {
  market: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  daysElapsed: number;
  /** Selling days in the anchor (first) month — the per-day funnel-target basis. */
  workingDays: number;
  /** Selling days in the ENTIRE period (whole year for YTD, whole quarter for QTD).
   *  Drives the WORKING/ELAPSED tile, elapsed-% and projected-pace denominator. */
  periodWorkingDays: number;
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
  // Keep the latest snapshot per (market, month) so multi-source display markets
  // (Fort Lauderdale) sum correctly alongside multi-month ranges.
  const latestPerMonth = new Map<string, MonthlySnapshotRow>();
  for (const r of rows) {
    const key = `${String(r.market ?? "")}|${r.period_start}`;
    const prev = latestPerMonth.get(key);
    if (!prev || String(r.as_of_date) > String(prev.as_of_date)) {
      latestPerMonth.set(key, r);
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
    period_working_days: ctx.periodWorkingDays,
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
    // Good Rate — single SOLD basis: (sold gross − cancellations) ÷ sold gross. The sold-net
    // per month isn't summable (the RTP realign strips the cancellation bucket), so aggregate the
    // per-month good_rate_pct (each already sold-basis) GROSS-weighted: Σ(gr_i·gross_i)/Σgross_i =
    // ΣsoldNet_i/Σgross_i. NOT released ÷ gross (that mixed RTP net over sold gross).
    good_rate_pct: (() => {
      let wsum = 0;
      let gsum = 0;
      for (const r of months) {
        const g = num(r.gross_sales);
        const gr = r.good_rate_pct;
        if (gr != null && g > 0) {
          wsum += Number(gr) * g;
          gsum += g;
        }
      }
      return gsum > 0 ? Math.round((wsum / gsum) * 10) / 10 : null;
    })(),
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
