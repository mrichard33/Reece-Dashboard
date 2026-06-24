import { describe, it, expect } from "vitest";
import { aggregateActuals, type MonthlySnapshotRow } from "./scorecardAggregate.core";

// Two months, each with TWO snapshots — the aggregator must take the latest
// snapshot per month (max as_of_date) and ignore the earlier mid-month one.
const rows: MonthlySnapshotRow[] = [
  // May: stale mid-month snapshot (must be ignored)
  {
    period_start: "2026-05-01",
    as_of_date: "2026-05-15",
    issued: 50,
    sets: 80,
    demos: 40,
    sales: 10,
    net_issue: 45,
    net_close: 8,
    ko_count: 2,
    gross_sales: 500_000,
    released_dollars: 400_000,
    working_dollars: 60_000,
    raw_leads_in: 100,
    raw_inputs: { bucket_tally: { other_pending: 10_000, cancelled_dollars: 40_000 } },
  },
  // May: final snapshot (must be used)
  {
    period_start: "2026-05-01",
    as_of_date: "2026-05-31",
    issued: 100,
    sets: 160,
    demos: 80,
    sales: 24,
    net_issue: 90,
    net_close: 20,
    ko_count: 4,
    gross_sales: 1_000_000,
    released_dollars: 800_000,
    working_dollars: 120_000,
    raw_leads_in: 220,
    raw_inputs: { bucket_tally: { other_pending: 30_000, cancelled_dollars: 80_000 } },
  },
  // June: single final snapshot
  {
    period_start: "2026-06-01",
    as_of_date: "2026-06-23",
    issued: 60,
    sets: 90,
    demos: 50,
    sales: 18,
    net_issue: 54,
    net_close: 15,
    ko_count: 3,
    gross_sales: 700_000,
    released_dollars: 560_000,
    working_dollars: 70_000,
    raw_leads_in: 130,
    raw_inputs: { bucket_tally: { other_pending: 20_000, cancelled_dollars: 70_000 } },
  },
];

const ctx = {
  market: "REECE",
  periodStart: "2026-05-01",
  periodEnd: "2026-06-23",
  asOf: "2026-06-23",
  daysElapsed: 46,
  workingDays: 26,
  reconciled: true,
};

describe("aggregateActuals", () => {
  const agg = aggregateActuals(rows, ctx);

  it("takes the latest snapshot per month and sums numerators", () => {
    // May final (100 issued) + June (60) — NOT the stale May 15 (50).
    expect(agg.issued).toBe(160);
    expect(agg.sets).toBe(250);
    expect(agg.demos).toBe(130);
    expect(agg.sales).toBe(42);
    expect(agg.released_dollars).toBe(1_360_000);
    expect(agg.gross_sales).toBe(1_700_000);
    expect(agg.raw_leads_in).toBe(350);
    expect(agg.raw_inputs?.bucket_tally?.other_pending).toBe(50_000);
  });

  it("re-derives ratios from the SUMS, not by averaging monthly percentages", () => {
    // NSLI = Σreleased ÷ Σissued = 1,360,000 / 160 = 8,500 (rounded).
    expect(agg.nsli).toBe(8_500);
    // close_pct = Σsales ÷ Σdemos = 42 / 130 = 32.3% (1-decimal).
    expect(agg.close_pct).toBe(32.3);
    // good_rate_pct = Σreleased ÷ Σgross = 1,360,000 / 1,700,000 = 80.0%.
    expect(agg.good_rate_pct).toBe(80);
    // A naive average of monthly NSLIs (8,000 and ~9,333) would be ~8,667 — confirm
    // we are NOT doing that.
    expect(agg.nsli).not.toBe(8_667);
  });

  it("Net Sales = released; Pending = working only", () => {
    expect(agg.net_sales).toBe(1_360_000);
    expect(agg.pending_total).toBe(190_000); // 120k + 70k working
    expect(agg.pending_dollars).toBe(190_000);
  });

  it("carries the period/selling-day context through", () => {
    expect(agg.period_start).toBe("2026-05-01");
    expect(agg.period_end).toBe("2026-06-23");
    expect(agg.days_elapsed).toBe(46);
    expect(agg.working_days_in_period).toBe(26);
    expect(agg.raw_inputs?.months_aggregated).toBe(2);
  });
});
