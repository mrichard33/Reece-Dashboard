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
 *  • SCOPE (2026-08-05 §1): several snapshots of one report type are current
 *    at the same time — a YTD pull and an MTD pull are different reports about
 *    different windows, not competing versions of one. Reads therefore choose
 *    ONE snapshot per report type per view (scoreSnapshot below) instead of
 *    summing every covering row, which would double-count the moment two
 *    windows share a period_start.
 *
 *    METRIC → SCOPE MAPPING
 *      Flow (issued · sat · sold count · gross sold · cancellations)
 *        → the snapshot whose scope matches the view: mtd for a month view,
 *          ytd for a year view. These accumulate within their own window and
 *          are correct the day they are pulled.
 *      Cohort-mature (net sold count · NSA · NSLI)
 *        → only from a snapshot that actually carries them. An MTD Sales
 *          Efficiency pull prints an EMPTY Net column (jobs sold this month
 *          have not matured to net), so the MTD projection emits no net_sold
 *          facts at all. Those figures then render "—" with a stated reason;
 *          they are NEVER borrowed from the YTD snapshot, whose net answers a
 *          different window and would silently overstate the month.
 *  • Pending buckets are a STOCK (current open pipeline from job_status_ytd,
 *    the point-in-time Job Status report) — they apply to any period view and
 *    carry their own as-of date. hoa / permit / other_pending each render
 *    count + dollars; buckets must foot to total open jobs.
 */
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { marketSources } from "@/lib/scorecard/markets";

/** Snapshot scope, mirrored onto every fact row by the ingest layer. */
export type FactScope = "mtd" | "ytd" | "month" | "custom";

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
  /** Null only for rows ingested before the scope column existed. */
  scope?: FactScope | null;
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
  /** Scope of the snapshot that answered — surfaced on the card. */
  scope: FactScope | null;
  soldCount: number;
  grossSoldDollars: number;
  /** Null when the answering snapshot carries no cancellations bucket. */
  cancelCount: number | null;
  cancelValueDollars: number | null;
  /**
   * Null when the answering snapshot is cohort-immature (an MTD Sales
   * Efficiency pull with a blank Net column). `netPendingReason` says why, so
   * the card can explain instead of showing a bare dash.
   */
  netAfterCancelsDollars: number | null;
  netPendingReason: string | null;
  /**
   * Month starts this figure was COMPOSED from, when no single snapshot
   * covered the period (§6). Null when one snapshot answered directly.
   */
  composedFrom?: string[] | null;
};

/**
 * Why a multi-month view cannot be answered — surfaced verbatim, never
 * approximated into a number (§6). `missingMonths` names the exact month
 * starts with no snapshot, so the gap is actionable rather than a shrug.
 */
export type PeriodGap = {
  reason: string;
  missingMonths: string[];
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

/**
 * Leads — report 135 (lead_disposition) is the ONE authoritative source, for
 * every market AND the company. Report 136 (source_cost) carries a company
 * leads figure too; it is a RECONCILIATION row here, never a second read path.
 */
export type LeadsFacts = {
  /** Σ of the market's branch-grain rows. Null = not sourced → renders "—". */
  leads: number | null;
  basis: "lead_disposition";
  asOf: string;
  /** Company control total from 136, for display alongside — never instead. */
  reconLeads: number | null;
  /** 135 − 136. Expected |delta| ≤ 4 on the YTD pull (see §5 gate). */
  reconDelta: number | null;
};

export type ReportFacts = {
  sold: SoldFacts | null;
  goodBusiness: GoodBusinessFacts | null;
  leads: LeadsFacts | null;
};

const dollars = (cents: number | null | undefined): number | null =>
  cents == null ? null : cents / 100;

/** Does this fact's snapshot window answer the resolved (flow) period? */
export function coversPeriod(f: ReportFactRow, resolved: ResolvedPeriod): boolean {
  const needEnd = resolved.asOf < resolved.periodEnd ? resolved.asOf : resolved.periodEnd;
  return f.period_start === resolved.periodStart && f.period_end >= needEnd;
}

/** The scope a view of this shape wants, in preference order. */
export function preferredScopes(resolved: ResolvedPeriod): FactScope[] {
  return resolved.key === "ytd"
    ? ["ytd", "custom", "month", "mtd"]
    : ["mtd", "month", "custom", "ytd"];
}

/**
 * Identity of the snapshot a fact row came from. Facts do not carry
 * snapshot_id, but (window, as-of, scope) separates any two simultaneously
 * current snapshots of one report type.
 */
const snapshotKey = (f: ReportFactRow) =>
  `${f.period_start}|${f.period_end}|${f.as_of_date}|${f.scope ?? ""}`;

/**
 * Choose ONE snapshot's rows out of every covering row of a report type.
 * Preference: the scope this view wants, then the freshest as-of, then the
 * tightest window. Summing across snapshots is never correct — two current
 * snapshots are two reports, not two halves of one.
 */
function pickSnapshot(rows: ReportFactRow[], resolved: ResolvedPeriod): ReportFactRow[] {
  if (!rows.length) return rows;
  const order = preferredScopes(resolved);
  const rank = (f: ReportFactRow) => {
    const i = f.scope ? order.indexOf(f.scope) : -1;
    return i < 0 ? order.length : i; // unknown/legacy scope sorts last, still usable
  };
  const groups = new Map<string, ReportFactRow[]>();
  for (const r of rows) {
    const k = snapshotKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const best = [...groups.values()].sort((a, b) => {
    const ra = rank(a[0]!), rb = rank(b[0]!);
    if (ra !== rb) return ra - rb;
    if (a[0]!.as_of_date !== b[0]!.as_of_date) return a[0]!.as_of_date < b[0]!.as_of_date ? 1 : -1;
    return a[0]!.period_end < b[0]!.period_end ? -1 : 1; // tightest window wins ties
  })[0]!;
  return best;
}

/** First-of-month for a YYYY-MM-DD. */
const monthStartOf = (ymd: string): string => `${ymd.slice(0, 7)}-01`;

/** Last day of the month containing a YYYY-MM-DD. */
const monthEndOf = (ymd: string): string =>
  new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0, 12))
    .toISOString()
    .slice(0, 10);

/**
 * Every month start the resolved period touches, in order.
 * YTD on Aug 6 → Jan…Aug. Trailing 3M → Jun, Jul, Aug.
 */
export function monthsInPeriod(resolved: ResolvedPeriod): string[] {
  const out: string[] = [];
  let cur = monthStartOf(resolved.periodStart);
  const last = monthStartOf(resolved.periodEnd >= resolved.periodStart ? resolved.periodEnd : resolved.periodStart);
  // Bounded: a period spanning more than five years is a bug, not a query.
  for (let i = 0; i < 72 && cur <= last; i++) {
    out.push(cur);
    const y = Number(cur.slice(0, 4));
    const m = Number(cur.slice(5, 7));
    cur = new Date(Date.UTC(y, m, 1, 12)).toISOString().slice(0, 10);
  }
  return out;
}

/**
 * Does the period start on a month boundary? A custom range that does not is
 * NOT composable from month snapshots, and §6 requires saying so rather than
 * silently approximating with whole months.
 */
export function isMonthAligned(resolved: ResolvedPeriod): boolean {
  return resolved.periodStart.slice(8, 10) === "01";
}

/**
 * COMPOSE a multi-month figure from per-month snapshots (§6).
 *
 * Reports 136 and 137 arrive PRE-AGGREGATED over whatever range LP was asked
 * for, so a 3-month figure cannot be derived from a YTD aggregate by any query
 * — which is why 3-Month cancellations read "not yet sourced" when only MTD and
 * YTD snapshots existed. The fix is to store one snapshot per month (scope
 * 'month') and add them up.
 *
 * The last month is the subtle one: it is usually PARTIAL. A month-scoped
 * snapshot covers the whole month and would overstate a period ending on the
 * 5th, so the current month is taken from its 'mtd' snapshot instead. Fully
 * elapsed months take their 'month' snapshot; a 'ytd' snapshot is never a part,
 * because it answers a different window.
 *
 * Fail-closed: if ANY month in the range has no usable snapshot, this returns
 * the gap rather than a partial sum. A sum missing March is not a smaller
 * number, it is a wrong one.
 */
export function composeMonthly(
  rows: ReportFactRow[],
  resolved: ResolvedPeriod,
  match: (r: ReportFactRow) => boolean,
): { parts: ReportFactRow[][]; months: string[] } | PeriodGap {
  if (!isMonthAligned(resolved)) {
    return {
      reason: `this range starts mid-month (${resolved.periodStart}) — the source reports arrive pre-aggregated per month, so a range off month boundaries cannot be composed`,
      missingMonths: [],
    };
  }
  const months = monthsInPeriod(resolved);
  const currentMonth = monthStartOf(resolved.periodEnd >= resolved.periodStart ? resolved.periodEnd : resolved.periodStart);

  const parts: ReportFactRow[][] = [];
  const missing: string[] = [];
  for (const m of months) {
    const isPartial = m === currentMonth && resolved.periodEnd < monthEndOf(m);
    const wanted: FactScope[] = isPartial ? ["mtd", "month"] : ["month", "mtd"];
    const candidates = rows.filter((r) => match(r) && r.period_start === m);
    let chosen: ReportFactRow[] | null = null;
    for (const scope of wanted) {
      const group = candidates.filter((r) => r.scope === scope);
      if (!group.length) continue;
      // Newest as-of wins within a scope.
      const asOf = group.reduce((a, r) => (r.as_of_date > a ? r.as_of_date : a), group[0]!.as_of_date);
      chosen = group.filter((r) => r.as_of_date === asOf);
      break;
    }
    if (chosen) parts.push(chosen);
    else missing.push(m);
  }

  if (missing.length) {
    return {
      reason: `no snapshot for ${missing.length === 1 ? "one month" : `${missing.length} months`} in this range (${missing.join(", ")}) — reports 136 and 137 arrive pre-aggregated, so each month needs its own pull`,
      missingMonths: missing,
    };
  }
  return { parts, months };
}

export const isPeriodGap = (v: unknown): v is PeriodGap =>
  !!v && typeof v === "object" && "missingMonths" in (v as Record<string, unknown>);

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
  // bucket, not a sold−net inference.
  const inMarket = marketFilter(marketCode);
  const seMatch = (r: ReportFactRow) => r.report_type === "sales_efficiency" && inMarket(r.market);
  let se = pickSnapshot(rows.filter((r) => seMatch(r) && coversPeriod(r, resolved)), resolved);
  let composedFrom: string[] | null = null;

  // §6 — nothing covers this window as a single pull. Reports 136/137 arrive
  // PRE-AGGREGATED over whatever range LP was asked for, so a 3-month figure
  // cannot be derived from a YTD aggregate by any query: it has to be added up
  // from per-month snapshots. This is why 3-Month cancellations read "not yet
  // sourced" while MTD and YTD both answered.
  if (!se.length && monthsInPeriod(resolved).length > 1) {
    const composed = composeMonthly(rows, resolved, seMatch);
    if (!isPeriodGap(composed)) {
      se = composed.parts.flat();
      composedFrom = composed.months;
    }
  }

  if (se.length) {
    const sold = sumMetric(se, "sold");
    const netSold = sumMetric(se, "net_sold");
    const cancelled = sumMetric(se, "cancelled");
    if (sold.seen && sold.cents != null) {
      // Cohort-mature figures come from THIS snapshot or not at all. An MTD
      // pull carries no net_sold facts (blank Net column); the month's net is
      // genuinely not yet knowable, and the YTD snapshot's net answers a
      // different window.
      const netSourced = netSold.seen && netSold.cents != null;
      // A composed figure is as-of the NEWEST part, and its scope is the
      // composition rather than any one snapshot's.
      const asOf = se.reduce((a, r) => (r.as_of_date > a ? r.as_of_date : a), se[0]!.as_of_date);
      return {
        basis: "sales_efficiency",
        asOf: composedFrom ? asOf : se[0]!.as_of_date,
        scope: composedFrom ? "month" : (se[0]!.scope ?? null),
        composedFrom,
        soldCount: sold.count,
        grossSoldDollars: dollars(sold.cents)!,
        cancelCount: cancelled.seen ? cancelled.count : netSourced ? sold.count - netSold.count : null,
        cancelValueDollars: cancelled.seen && cancelled.cents != null
          ? dollars(cancelled.cents)!
          : netSourced ? dollars(sold.cents - netSold.cents!)! : null,
        netAfterCancelsDollars: netSourced ? dollars(netSold.cents)! : null,
        netPendingReason: netSourced
          ? null
          : "this period's Net column is still maturing — jobs sold this month have not netted yet",
      };
    }
  }
  if (marketCode === "REECE") {
    const sc = pickSnapshot(
      rows.filter((r) => r.report_type === "source_cost" && coversPeriod(r, resolved)),
      resolved,
    );
    if (!sc.length) return null;
    const sold = sumMetric(sc, "sold");
    const netSold = sumMetric(sc, "net_sold");
    const gross = sumMetric(sc, "gross_sold");
    const nsa = sumMetric(sc, "net_sales");
    if (!sold.seen || !netSold.seen || gross.cents == null || nsa.cents == null) return null;
    return {
      basis: "control_totals",
      asOf: sc[0]!.as_of_date,
      scope: sc[0]!.scope ?? null,
      soldCount: sold.count,
      grossSoldDollars: dollars(gross.cents)!,
      cancelCount: sold.count - netSold.count,
      cancelValueDollars: dollars(gross.cents - nsa.cents)!,
      netAfterCancelsDollars: dollars(nsa.cents)!,
      netPendingReason: null,
    };
  }
  const ld = pickSnapshot(
    rows.filter(
      (r) => r.report_type === "lead_disposition" && inMarket(r.market) && coversPeriod(r, resolved),
    ),
    resolved,
  );
  if (!ld.length) return null;
  const sold = sumMetric(ld, "sold");
  const netSold = sumMetric(ld, "net_sold");
  if (!sold.seen) return null;
  return {
    basis: "lead_attributed",
    asOf: ld[0]!.as_of_date,
    scope: ld[0]!.scope ?? null,
    soldCount: sold.count,
    grossSoldDollars: dollars(sold.cents ?? 0)!,
    cancelCount: sold.count - netSold.count,
    cancelValueDollars: dollars((sold.cents ?? 0) - (netSold.cents ?? 0))!,
    netAfterCancelsDollars: dollars(netSold.cents ?? 0)!,
    netPendingReason: null,
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

/**
 * Leads for one dashboard market — report 135, and only report 135.
 *
 * TWO DEFECTS THIS REPLACES (§4, live 2026-08-06):
 *
 *  1. GRAIN. lp_report_facts is stored at BRANCH grain with `market` as a
 *     rollup label — Fort Lauderdale carries five lead_disposition rows
 *     (1,608 · 3,181 · 5,427 · 29 · 286). Anything that doesn't sum them
 *     reports one branch's number, or nothing. `sumMetric` sums, so a market's
 *     branches add up before anyone divides or displays.
 *
 *  2. WRONG SOURCE. By Market read `raw_leads_in` off lp_market_scorecard_daily,
 *     which is NULL for every market — coerced through numOr0() it rendered a
 *     confident 0 leads for every office while the company row showed a
 *     non-zero total. Null is "not sourced" and must render "—" with a reason.
 *
 * Per-market leads sum to 78,557, matching lp_lead_disposition_history's row
 * count exactly. Report 136's company figure (78,561) rides along as a
 * reconciliation, 4 apart — which is precisely the tolerance §5 defines as
 * report 135's validation gate, since 135 has no footer total row of its own.
 */
function buildLeads(rows: ReportFactRow[], resolved: ResolvedPeriod, marketCode: string): LeadsFacts | null {
  const inMarket = marketFilter(marketCode);
  const ld = pickSnapshot(
    rows.filter(
      (r) => r.report_type === "lead_disposition" && inMarket(r.market) && coversPeriod(r, resolved),
    ),
    resolved,
  );
  if (!ld.length) return null;

  const leads = sumMetric(ld, "leads");
  if (!leads.seen) return null;

  // Company control total from 136 — reconciliation only, never the read path.
  const sc = pickSnapshot(
    rows.filter((r) => r.report_type === "source_cost" && coversPeriod(r, resolved)),
    resolved,
  );
  const recon = marketCode === "REECE" ? sumMetric(sc, "leads") : { seen: false, count: 0 };

  return {
    leads: leads.count,
    basis: "lead_disposition",
    asOf: ld[0]!.as_of_date,
    reconLeads: recon.seen ? recon.count : null,
    reconDelta: recon.seen ? leads.count - recon.count : null,
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
    leads: buildLeads(rows, resolved, marketCode),
  };
}
