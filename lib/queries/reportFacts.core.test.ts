import { describe, expect, test } from "vitest";
import { buildReportFacts, coversPeriod, type ReportFactRow } from "./reportFacts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * Guards for the lp_report_facts projection — Sold This Period and Net (Good
 * Business) figures for the ③ cards.
 *
 * The regression that motivated this module (2026-08-05): cancellation value
 * was computed as the gross−net residual, so a zero net_sales rendered
 * cancellations equal to gross sold and surviving business $0. Here the
 * cancel value must equal GSA − NSA exactly and NEVER equal gross when NSA
 * is present; missing sources must yield null (→ "—"), never 0.
 */

const YTD: ResolvedPeriod = {
  key: "ytd",
  label: "Year to date",
  periodStart: "2026-01-01",
  periodEnd: "2026-08-05",
  asOf: "2026-08-05",
  isPartial: true,
  source: "aggregate",
} as ResolvedPeriod;

const MTD: ResolvedPeriod = {
  ...YTD,
  key: "month",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  source: "snapshot",
} as ResolvedPeriod;

const base = {
  period_start: "2026-01-01",
  period_end: "2026-08-05",
  as_of_date: "2026-08-05",
  branch_code_raw: null,
  bucket: null,
} as const;

const sc = (metric: string, value_cents: number | null, value_count: number): ReportFactRow => ({
  ...base, report_type: "source_cost", market: "REECE", metric, value_cents, value_count,
});
const ld = (market: string, metric: string, value_cents: number | null, value_count: number): ReportFactRow => ({
  ...base, report_type: "lead_disposition", market, metric, value_cents, value_count,
});
const js = (market: string, bucket: string, value_cents: number, value_count: number): ReportFactRow => ({
  ...base,
  report_type: "job_status_ytd",
  market,
  metric: bucket === "excluded" ? "pipeline_excluded" : "good_business_open",
  bucket,
  value_cents,
  value_count,
});

// The live 2026-08-05 control totals, in cents.
const SOURCE_COST: ReportFactRow[] = [
  sc("sold", null, 3344),
  sc("net_sold", null, 2389),
  sc("gross_sold", 7_990_466_720, 127),
  sc("net_sales", 5_689_378_743, 127),
];

describe("Sold This Period (company = control totals)", () => {
  test("five-line structure ties the §0 control totals", () => {
    const { sold } = buildReportFacts(SOURCE_COST, YTD, "REECE");
    expect(sold).not.toBeNull();
    expect(sold!.basis).toBe("control_totals");
    expect(sold!.soldCount).toBe(3344);
    expect(sold!.grossSoldDollars).toBeCloseTo(79_904_667.2, 2);
    expect(sold!.cancelCount).toBe(3344 - 2389);
    expect(sold!.cancelValueDollars).toBeCloseTo(23_010_879.77, 2);
    expect(sold!.netAfterCancelsDollars).toBeCloseTo(56_893_787.43, 2);
  });

  test("REGRESSION: cancellation value = GSA − NSA, never the gross figure", () => {
    const { sold } = buildReportFacts(SOURCE_COST, YTD, "REECE");
    expect(sold!.cancelValueDollars).not.toBe(sold!.grossSoldDollars);
    expect(sold!.cancelValueDollars).toBeCloseTo(
      sold!.grossSoldDollars - sold!.netAfterCancelsDollars, 6);
    // and surviving business does NOT collapse to zero
    expect(sold!.netAfterCancelsDollars).toBeGreaterThan(0);
  });

  test("period gate: a YTD snapshot never answers an MTD view → null → '—'", () => {
    const { sold } = buildReportFacts(SOURCE_COST, MTD, "REECE");
    expect(sold).toBeNull();
  });

  test("no facts at all → null, never zeros", () => {
    const { sold, goodBusiness } = buildReportFacts([], YTD, "REECE");
    expect(sold).toBeNull();
    expect(goodBusiness).toBeNull();
  });
});

describe("Sold This Period (market = lead-attributed basis)", () => {
  const rows = [
    ld("ORL_MKT", "sold", 1_000_00, 2),
    ld("ORL_MKT", "net_sold", 700_00, 1),
    ld("LAKE_MKT", "sold", 500_00, 1),
    ld("LAKE_MKT", "net_sold", 500_00, 1),
    ld("SAR_MKT", "sold", 999_00, 9),
  ];
  test("Orlando folds ORL + LAKE sources and labels the basis", () => {
    const { sold } = buildReportFacts(rows, YTD, "ORL_MKT");
    expect(sold!.basis).toBe("lead_attributed");
    expect(sold!.soldCount).toBe(3);
    expect(sold!.grossSoldDollars).toBe(1500);
    expect(sold!.cancelCount).toBe(1);
    expect(sold!.cancelValueDollars).toBe(300);
    expect(sold!.netAfterCancelsDollars).toBe(1200);
  });
  test("other markets' rows never leak in", () => {
    const { sold } = buildReportFacts(rows, YTD, "SAR_MKT");
    expect(sold!.soldCount).toBe(9);
  });
});

describe("Net (Good Business) pending buckets", () => {
  const rows = [
    js("ORL_MKT", "hoa", 100_000_00, 3),
    js("ORL_MKT", "permit", 50_000_00, 1),
    js("SAR_MKT", "other_pending", 25_000_00, 2),
    js("SAR_MKT", "excluded", 900_000_00, 10),
    js("UNASSIGNED", "excluded", 34_400_00, 2),
  ];
  test("buckets carry count + dollars and foot to all open jobs (company)", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, YTD, "REECE");
    expect(gb!.hoa).toEqual({ count: 3, dollars: 100_000 });
    expect(gb!.permit).toEqual({ count: 1, dollars: 50_000 });
    expect(gb!.otherPending).toEqual({ count: 2, dollars: 25_000 });
    expect(gb!.pendingTotalDollars).toBe(175_000);
    expect(gb!.pendingTotalCount).toBe(6);
    // footing: hoa + permit + other + excluded == every open job, UNASSIGNED included
    expect(gb!.openJobsTotal).toBe(18);
  });
  test("stock semantics: buckets answer an MTD view too (with their own as-of)", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, MTD, "REECE");
    expect(gb).not.toBeNull();
    expect(gb!.asOf).toBe("2026-08-05");
  });
  test("market filter applies; missing market → null, never a zero bucket", () => {
    const { goodBusiness: gb } = buildReportFacts(rows, YTD, "ORL_MKT");
    expect(gb!.pendingTotalCount).toBe(4);
    const { goodBusiness: none } = buildReportFacts(rows, YTD, "JAX_MKT");
    expect(none).toBeNull();
  });
});

describe("coversPeriod", () => {
  const row = SOURCE_COST[0]!;
  test("same window, as-of inside → covered", () => {
    expect(coversPeriod(row, YTD)).toBe(true);
  });
  test("different period_start → not covered", () => {
    expect(coversPeriod(row, MTD)).toBe(false);
  });
  test("stale snapshot (period_end before as-of) → not covered", () => {
    expect(coversPeriod({ ...row, period_end: "2026-07-31" }, YTD)).toBe(false);
  });
});
