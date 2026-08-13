/**
 * RTP (released-to-production) net for the CURRENT (in-progress) month.
 *
 * ⚠️ D3 — THIS IS NOT A "NET REPORT". No such source exists or is coming.
 * Reece Net Sales is computed from report 137 alone: GSA − GSACancelled − GSACD.
 * What this module composes is RELEASED value by milestone date — a different
 * economic event, feeding the Released panel and the RTP hero path only, never
 * a sales figure. The name below is historical; the quantity is RTP.
 *
 * The warehouse (lp_market_scorecard_daily) computes the live month on the legacy
 * released/working/cancel basis by SOLD date, which OVERSTATES the RTP net. The LP
 * RTP (Released-to-Production, by milestone date) is the authoritative released
 * source and has no warehouse equivalent for the open month — and no true "net"
 * field at all. So the YTD / period hero must compose from report-sourced values
 * end to end:
 *
 *     hero net = Σ(closed months, computed_from = 'net_report_rtp')  +  currentMonth.rtpNet
 *
 * Closed months already flow in automatically via the net_report_rtp loader; only
 * the OPEN month lives here. This is a deliberate design decision (the report stays
 * authoritative for net), not a gap to reconcile against the warehouse.
 *
 * ⚠ Update `CURRENT_MONTH_REPORT_RTP` whenever a fresh RTP export is pulled
 * (Mark's export). When the month closes and its net_report_rtp row lands in the
 * warehouse, this override deactivates on its own (see composeReportHeroNet).
 */

export type CurrentMonthReportRtp = {
  /** First-of-month the figure applies to, YYYY-MM-DD. */
  month: string;
  /** Report data current-through date, YYYY-MM-DD (drives the "as of" read). */
  asOf: string;
  /** Report RTP net, month-to-date, for the company (REECE) roll-up. */
  rtpNet: number;
};

// LP RTP export — released net, July 1–9 2026 (company). Ties YTD to $48,724,514.60
// alongside the Jan–Jun report-sourced closed months ($47,814,304.43).
export const CURRENT_MONTH_REPORT_RTP: CurrentMonthReportRtp = {
  month: "2026-07-01",
  asOf: "2026-07-09",
  rtpNet: 910210.17,
};

/** Market the report figure applies to (company roll-up only). */
const REPORT_MARKET = "REECE";

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** One latest-per-month snapshot row (the fields the hero composition needs). */
export type HeroMonthRow = {
  period_start: string;
  released_dollars: unknown;
  net_sales: unknown;
  computed_from: unknown;
};

/**
 * Report-sourced hero net for a company aggregate that spans the current
 * in-progress month:  Σ(closed-month report net) + the report's RTP-to-date for
 * the open month. Returns null (→ keep the warehouse sum) unless ALL hold:
 *   • market is the company roll-up (REECE),
 *   • the constant actually describes the CURRENT ET month (`currentMonthET`) —
 *     a stale constant (last updated for a month that has since closed) must
 *     never silently override live data; it deactivates and logs instead,
 *   • the report month is inside the aggregated range, and
 *   • that month is still LIVE (its warehouse row is not yet net_report_rtp).
 *
 * `monthsLatest` must be the latest snapshot per month in range.
 */
export function composeReportHeroNet(
  monthsLatest: HeroMonthRow[],
  market: string,
  currentMonthET: string,
): number | null {
  if (market !== REPORT_MARKET) return null;
  const rc = CURRENT_MONTH_REPORT_RTP;
  if (rc.month !== currentMonthET) {
    // Surface the staleness visibly instead of silently applying a wrong figure.
    console.error(
      `[scorecard] CURRENT_MONTH_REPORT_RTP is stale (constant month ${rc.month}, current ET month ${currentMonthET}) — override skipped; update lib/scorecard/reportRtp.ts from the latest RTP export.`,
    );
    return null;
  }
  const current = monthsLatest.find((r) => String(r.period_start).slice(0, 10) === rc.month);
  // Only override while the open month is present AND still on the legacy live basis.
  if (!current || String(current.computed_from) === "net_report_rtp") return null;

  let sum = 0;
  for (const r of monthsLatest) {
    if (String(r.period_start).slice(0, 10) === rc.month) {
      sum += rc.rtpNet;
    } else {
      sum += num(r.released_dollars) || num(r.net_sales);
    }
  }
  return Math.round(sum);
}
