/**
 * Pure projection of `lp_report_facts` (is_current) rows into the Sold This
 * Period and Net (Good Business) figures — the read surface for the CSV-era
 * report sources (source_cost / lead_disposition / job_status_ytd).
 *
 * DESIGN RULES (handoff 2026-08-05):
 *  • Every figure is `number | null`. Null means "not yet sourced" and MUST
 *    render as "—" — never $0, which reads as "no jobs held" and is false.
 *  • Company (REECE) Sold figures come ONLY from source_cost facts — the
 *    marketing report is the control-total authority, tying LP to the cent.
 *    Market-filtered Sold figures come from lead_disposition facts and are a
 *    DIFFERENT basis (lead-attributed; verified 2026-08-05: +$222,801 GSA /
 *    −$3,395,938 net vs the company totals) — the card labels the basis.
 *  • PERIOD GATE (flow metrics): a facts snapshot answers the resolved period
 *    only when it covers the same window — same period_start and a period_end
 *    reaching the resolved as-of. A YTD backfill must not leak into an MTD
 *    view; daily MTD snapshots will satisfy MTD naturally once scheduled.
 *  • Pending buckets are a STOCK (current open pipeline from job_status_ytd,
 *    the point-in-time Job Status report) — they apply to any period view and
 *    carry their own as-of date. hoa / permit / other_pending each render
 *    count + dollars; buckets must foot to total open jobs.
 */
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { marketSources } from "@/lib/scorecard/markets";

export type ReportFactRow = {
  report_type: string;
  period_start: string;
  period_end: string;
  as_of_date: string;
  market: string;
  branch_code_raw: string | null;
  metric: string;
  bucket: string | null;
  value_cents: number | null;
  value_count: number;
};

export type SoldFacts = {
  /**
   * 'sales_efficiency' = report 137, the AUTHORITATIVE per-market (and
   * company) funnel source with an explicit cancellations bucket;
   * 'control_totals' = company source_cost report (fallback);
   * 'lead_attributed' = per-market lead rows (fallback).
   * Fallbacks apply only when no covering 137 snapshot exists — every
   * non-authoritative source is otherwise a recon check, never a read path.
   */
  basis: "sales_efficiency" | "control_totals" | "lead_attributed";
  asOf: string;
  soldCount: number;
  grossSoldDollars: number;
  cancelCount: number;
  cancelValueDollars: number;
  netAfterCancelsDollars: number;
};

export type PendingBucket = { count: number; dollars: number };

export type GoodBusinessFacts = {
  asOf: string;
  hoa: PendingBucket;
  permit: PendingBucket;
  otherPending: PendingBucket;
  /** Released/production-track open jobs — outside pending Good Business. */
  excluded: PendingBucket;
  pendingTotalDollars: number;
  pendingTotalCount: number;
  /** hoa+permit+other+excluded counts — must equal every open job (footing proof). */
  openJobsTotal: number;
};

export type ReportFacts = {
  sold: SoldFacts | null;
  goodBusiness: GoodBusinessFacts | null;
};

const dollars = (cents: number | null | undefined): number | null =>
  cents == null ? null : cents / 100;

/** Does this fact's snapshot window answer the resolved (flow) period? */
export function coversPeriod(f: ReportFactRow, resolved: ResolvedPeriod): boolean {
  const needEnd = resolved.asOf < resolved.periodEnd ? resolved.asOf : resolved.periodEnd;
  return f.period_start === resolved.periodStart && f.period_end >= needEnd;
}

/** Markets a fact row must belong to for a dashboard market code. */
function marketFilter(marketCode: string): ((m: string) => boolean) {
  if (marketCode === "REECE") return () => true; // company = Σ everything, UNASSIGNED included
  const sources = new Set(marketSources(marketCode));
  return (m) => sources.has(m);
}

function sumMetric(rows: ReportFactRow[], metric: string) {
  let count = 0;
  let cents: number | null = null;
  let seen = false;
  for (const r of rows) {
    if (r.metric !== metric) continue;
    seen = true;
    count += r.value_count;
    if (r.value_cents != null) cents = (cents ?? 0) + r.value_cents;
  }
  return { seen, count, cents };
}

function buildSold(rows: ReportFactRow[], resolved: ResolvedPeriod, marketCode: string): SoldFacts | null {
  // Report 137 first — authoritative for Issued/Sat/Sold/Cancelled/NSA by
  // market AND company (Σ markets). Cancellations come from its EXPLICIT
  // bucket, not a sold−net inference. counts_only (MTD) snapshots carry no
  // net_sold facts → netAfterCancels stays unsourced rather than fabricated,
  // so we fall through to the older bases in that case.
  const inMarket = marketFilter(marketCode);
  const se = rows.filter(
    (r) => r.report_type === "sales_efficiency" && inMarket(r.market) && coversPeriod(r, resolved),
  );
  if (se.length) {
    const sold = sumMetric(se, "sold");
    const netSold = sumMetric(se, "net_sold");
    const cancelled = sumMetric(se, "cancelled");
    if (sold.seen && netSold.seen && sold.cents != null && netSold.cents != null) {
      return {
        basis: "sales_efficiency",
        asOf: se[0]!.as_of_date,
        soldCount: sold.count,
        grossSoldDollars: dollars(sold.cents)!,
        cancelCount: cancelled.seen ? cancelled.count : sold.count - netSold.count,
        cancelValueDollars: cancelled.seen && cancelled.cents != null
          ? dollars(cancelled.cents)!
          : dollars(sold.cents - netSold.cents)!,
        netAfterCancelsDollars: dollars(netSold.cents)!,
      };
    }
  }
  if (marketCode === "REECE") {
    const sc = rows.filter((r) => r.report_type === "source_cost" && coversPeriod(r, resolved));
    if (!sc.length) return null;
    const sold = sumMetric(sc, "sold");
    const netSold = sumMetric(sc, "net_sold");
    const gross = sumMetric(sc, "gross_sold");
    const nsa = sumMetric(sc, "net_sales");
    if (!sold.seen || !netSold.seen || gross.cents == null || nsa.cents == null) return null;
    return {
      basis: "control_totals",
      asOf: sc[0]!.as_of_date,
      soldCount: sold.count,
      grossSoldDollars: dollars(gross.cents)!,
      cancelCount: sold.count - netSold.count,
      cancelValueDollars: dollars(gross.cents - nsa.cents)!,
      netAfterCancelsDollars: dollars(nsa.cents)!,
    };
  }
  const ld = rows.filter(
    (r) => r.report_type === "lead_disposition" && inMarket(r.market) && coversPeriod(r, resolved),
  );
  if (!ld.length) return null;
  const sold = sumMetric(ld, "sold");
  const netSold = sumMetric(ld, "net_sold");
  if (!sold.seen) return null;
  return {
    basis: "lead_attributed",
    asOf: ld[0]!.as_of_date,
    soldCount: sold.count,
    grossSoldDollars: dollars(sold.cents ?? 0)!,
    cancelCount: sold.count - netSold.count,
    cancelValueDollars: dollars((sold.cents ?? 0) - (netSold.cents ?? 0))!,
    netAfterCancelsDollars: dollars(netSold.cents ?? 0)!,
  };
}

function buildGoodBusiness(rows: ReportFactRow[], marketCode: string): GoodBusinessFacts | null {
  const inMarket = marketFilter(marketCode);
  // Stock semantics: the current job_status_ytd snapshot is the open pipeline
  // as of its own date — no flow-period gate.
  const js = rows.filter((r) => r.report_type === "job_status_ytd" && inMarket(r.market));
  if (!js.length) return null;
  const bucket = (name: string): PendingBucket => {
    let count = 0, cents = 0;
    for (const r of js) {
      if (r.bucket !== name) continue;
      count += r.value_count;
      cents += r.value_cents ?? 0;
    }
    return { count, dollars: cents / 100 };
  };
  const hoa = bucket("hoa");
  const permit = bucket("permit");
  const otherPending = bucket("other_pending");
  const excluded = bucket("excluded");
  return {
    asOf: js[0]!.as_of_date,
    hoa,
    permit,
    otherPending,
    excluded,
    pendingTotalDollars: hoa.dollars + permit.dollars + otherPending.dollars,
    pendingTotalCount: hoa.count + permit.count + otherPending.count,
    openJobsTotal: hoa.count + permit.count + otherPending.count + excluded.count,
  };
}

/** Project current fact rows into the card figures for one dashboard market. */
export function buildReportFacts(
  rows: ReportFactRow[],
  resolved: ResolvedPeriod,
  marketCode: string,
): ReportFacts {
  return {
    sold: buildSold(rows, resolved, marketCode),
    goodBusiness: buildGoodBusiness(rows, marketCode),
  };
}
