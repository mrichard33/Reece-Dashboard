import { describe, expect, it } from "vitest";
import { aggregateActuals, type MonthlySnapshotRow } from "./scorecardAggregate.core";

/**
 * Orlando merge (handoff test 7): ORL_MKT + LAKE_MKT rows sum into ONE Orlando
 * market — the aggregation core keys its latest-snapshot selection by
 * (market, period_start), so two source markets in the same month both count,
 * while stale earlier snapshots of either source are still dropped.
 */

const row = (
  market: string,
  as_of: string,
  issued: number,
  demos: number,
  sales: number,
  net: number,
): MonthlySnapshotRow => ({
  market,
  period_start: "2026-07-01",
  as_of_date: as_of,
  issued,
  sets: issued + 20,
  demos,
  sales,
  net_issue: issued - 5,
  net_close: sales - 1,
  ko_count: 1,
  gross_sales: net + 100_000,
  net_sales: net,
  released_dollars: net - 50_000,
  working_dollars: 40_000,
  raw_leads_in: issued * 2,
  good_rate_pct: 90,
});

const ctx = {
  market: "ORL_MKT",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-30",
  asOf: "2026-07-30",
  daysElapsed: 25,
  workingDays: 26,
  periodWorkingDays: 26,
  reconciled: true,
};

describe("Orlando = ORL_MKT + LAKE_MKT combined", () => {
  const rows = [
    row("ORL_MKT", "2026-07-15", 40, 25, 8, 400_000), // stale ORL — ignored
    row("ORL_MKT", "2026-07-30", 100, 70, 20, 1_100_000),
    row("LAKE_MKT", "2026-07-30", 30, 22, 6, 300_000),
  ];
  const agg = aggregateActuals(rows, ctx);

  it("sums the latest ORL and LAKE rows for the same month", () => {
    expect(agg.issued).toBe(130); // 100 + 30, NOT 40
    expect(agg.demos).toBe(92);
    expect(agg.sales).toBe(26);
    expect(agg.net_sales).toBe(1_400_000);
    expect(agg.released_dollars).toBe(1_300_000);
  });

  it("re-derives combined ratios from the sums", () => {
    // close% = 26 ÷ 92
    expect(agg.close_pct).toBe(28.3);
    // NSLI = 1,400,000 ÷ 130
    expect(agg.nsli).toBe(10_769);
  });

  it("still drops stale snapshots per source market", () => {
    // If the stale ORL row were double-counted, issued would be 170.
    expect(agg.issued).not.toBe(170);
  });
});
