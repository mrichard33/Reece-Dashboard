import { describe, expect, test } from "vitest";
import {
  buildReportFacts,
  composeMonthly,
  isMonthAligned,
  isPeriodGap,
  monthsInPeriod,
  type FactScope,
  type ReportFactRow,
} from "./reportFacts.core";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * §6 — reports 136 and 137 arrive PRE-AGGREGATED over whatever range LP was
 * asked for. A 3-month figure cannot be derived from a YTD aggregate by any
 * query, which is why 3-Month cancellations read "not yet sourced" while MTD
 * and YTD both answered: only those two scopes were ever stored.
 *
 * The fix is one snapshot per month (scope 'month'), composed on read. The
 * subtlety is the LAST month, which is usually partial — a month-scoped
 * snapshot covers the whole month and would overstate a period ending on the
 * 5th, so the current month comes from its 'mtd' snapshot instead.
 */

const period = (over: Partial<ResolvedPeriod>): ResolvedPeriod => ({
  key: "trailing_3m",
  label: "Last 3 months",
  periodStart: "2026-06-01",
  periodEnd: "2026-08-05",
  asOf: "2026-08-05",
  isPartial: false,
  source: "aggregate",
  ...over,
});

const THREE_M = period({});

const se = (
  monthStart: string,
  // The full FactScope, not a subset: §6 below builds a "custom"-scope snapshot
  // to prove a directly-covering snapshot beats composition, and this helper
  // could not express it.
  scope: FactScope,
  periodEnd: string,
  asOf: string,
  soldCount: number,
  soldCents: number,
  cancelCount: number,
  cancelCents: number,
): ReportFactRow[] => [
  { report_type: "sales_efficiency", period_start: monthStart, period_end: periodEnd, as_of_date: asOf,
    market: "SAR_MKT", branch_code_raw: "SAR", metric: "sold", bucket: null,
    value_cents: soldCents, value_count: soldCount, scope },
  { report_type: "sales_efficiency", period_start: monthStart, period_end: periodEnd, as_of_date: asOf,
    market: "SAR_MKT", branch_code_raw: "SAR", metric: "cancelled", bucket: null,
    value_cents: cancelCents, value_count: cancelCount, scope },
];

/** Jun and Jul as full months; August partial, from its MTD pull. */
const MONTHLY: ReportFactRow[] = [
  ...se("2026-06-01", "month", "2026-06-30", "2026-07-01", 60, 600_000_00, 6, 60_000_00),
  ...se("2026-07-01", "month", "2026-07-31", "2026-08-01", 70, 700_000_00, 7, 70_000_00),
  ...se("2026-08-01", "mtd", "2026-08-31", "2026-08-05", 8, 80_000_00, 1, 10_000_00),
];

describe("monthsInPeriod / isMonthAligned", () => {
  test("trailing 3M spans exactly its three month starts", () => {
    expect(monthsInPeriod(THREE_M)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
  });

  test("YTD spans Jan through the current month — not through December", () => {
    const ytd = period({ key: "ytd", periodStart: "2026-01-01" });
    expect(monthsInPeriod(ytd)).toHaveLength(8);
    expect(monthsInPeriod(ytd)[0]).toBe("2026-01-01");
    expect(monthsInPeriod(ytd).at(-1)).toBe("2026-08-01");
  });

  test("a single-month period is one month", () => {
    expect(monthsInPeriod(period({ periodStart: "2026-08-01" }))).toEqual(["2026-08-01"]);
  });

  test("alignment is judged on the period start", () => {
    expect(isMonthAligned(THREE_M)).toBe(true);
    expect(isMonthAligned(period({ periodStart: "2026-06-15" }))).toBe(false);
  });
});

describe("§6 — 3-Month composes from month snapshots", () => {
  test("cancellations populate in the 3-Month view", () => {
    const { sold } = buildReportFacts(MONTHLY, THREE_M, "SAR_MKT");
    expect(sold).not.toBeNull();
    // Before: no snapshot started 2026-06-01, so this was null → "not yet sourced".
    expect(sold!.cancelCount).toBe(6 + 7 + 1);
    // Fixture cents → dollars: Jun $60,000 + Jul $70,000 + Aug $10,000.
    expect(sold!.cancelValueDollars).toBeCloseTo(60_000 + 70_000 + 10_000, 2);
  });

  test("sold count and gross are the sum of the three months", () => {
    const { sold } = buildReportFacts(MONTHLY, THREE_M, "SAR_MKT");
    expect(sold!.soldCount).toBe(60 + 70 + 8);
    expect(sold!.grossSoldDollars).toBeCloseTo(600_000 + 700_000 + 80_000, 2);
  });

  test("the composition names its parts and its as-of is the newest", () => {
    const { sold } = buildReportFacts(MONTHLY, THREE_M, "SAR_MKT");
    expect(sold!.composedFrom).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
    expect(sold!.scope).toBe("month");
    expect(sold!.asOf).toBe("2026-08-05");
  });

  test("the PARTIAL current month comes from its MTD pull, not its whole month", () => {
    // A month-scoped August snapshot covering all of August would overstate a
    // period ending Aug 5. Offering both, the partial month must take the MTD.
    const both = [
      ...MONTHLY,
      ...se("2026-08-01", "month", "2026-08-31", "2026-08-31", 99, 990_000_00, 9, 90_000_00),
    ];
    const { sold } = buildReportFacts(both, THREE_M, "SAR_MKT");
    expect(sold!.soldCount).toBe(60 + 70 + 8); // the 8, not the 99
  });

  test("a fully-elapsed month prefers its month snapshot over any MTD leftover", () => {
    const withStaleMtd = [
      ...MONTHLY,
      ...se("2026-06-01", "mtd", "2026-06-30", "2026-06-15", 30, 300_000_00, 3, 30_000_00),
    ];
    const { sold } = buildReportFacts(withStaleMtd, THREE_M, "SAR_MKT");
    expect(sold!.soldCount).toBe(60 + 70 + 8); // the full-month 60, not the mid-month 30
  });
});

describe("§6 — fail closed, and say why", () => {
  test("a missing month yields NO figure and names the month", () => {
    const withoutJuly = MONTHLY.filter((r) => r.period_start !== "2026-07-01");
    const gap = composeMonthly(withoutJuly, THREE_M, (r) => r.report_type === "sales_efficiency");
    expect(isPeriodGap(gap)).toBe(true);
    if (isPeriodGap(gap)) {
      expect(gap.missingMonths).toEqual(["2026-07-01"]);
      expect(gap.reason).toMatch(/2026-07-01/);
      expect(gap.reason).toMatch(/pre-aggregated/);
    }
    // And the card shows nothing rather than a sum that quietly skipped July —
    // a total missing a month is not a smaller number, it is a wrong one.
    expect(buildReportFacts(withoutJuly, THREE_M, "SAR_MKT").sold).toBeNull();
  });

  test("a custom range off month boundaries SAYS SO instead of approximating", () => {
    const midMonth = period({ key: "custom", periodStart: "2026-06-15", periodEnd: "2026-08-05" });
    const gap = composeMonthly(MONTHLY, midMonth, (r) => r.report_type === "sales_efficiency");
    expect(isPeriodGap(gap)).toBe(true);
    if (isPeriodGap(gap)) {
      expect(gap.reason).toMatch(/starts mid-month/);
      expect(gap.reason).toMatch(/2026-06-15/);
    }
  });

  test("a YTD snapshot is never used as one month of a composition", () => {
    const ytdOnly: ReportFactRow[] = se("2026-06-01", "ytd", "2026-08-05", "2026-08-05", 500, 5_000_000_00, 50, 500_000_00);
    const gap = composeMonthly(ytdOnly, THREE_M, (r) => r.report_type === "sales_efficiency");
    expect(isPeriodGap(gap)).toBe(true);
    if (isPeriodGap(gap)) expect(gap.missingMonths).toHaveLength(3);
  });
});

describe("§6 — a single covering snapshot still wins", () => {
  test("composition is a FALLBACK, never a replacement for a direct answer", () => {
    const direct = se("2026-06-01", "custom", "2026-08-05", "2026-08-06", 200, 2_000_000_00, 20, 200_000_00);
    const { sold } = buildReportFacts([...direct, ...MONTHLY], THREE_M, "SAR_MKT");
    expect(sold!.soldCount).toBe(200);
    expect(sold!.composedFrom).toBeNull();
  });

  test("YTD composes from its month snapshots and ties to the YTD snapshot", () => {
    // Cross-check the handoff asks for: the composed total must reproduce the
    // directly-pulled YTD figure.
    const ytd = period({ key: "ytd", periodStart: "2026-01-01" });
    const months: ReportFactRow[] = [];
    for (let m = 1; m <= 7; m++) {
      const ms = `2026-${String(m).padStart(2, "0")}-01`;
      months.push(...se(ms, "month", `2026-${String(m).padStart(2, "0")}-28`, `2026-${String(m + 1).padStart(2, "0")}-01`, 10, 100_000_00, 1, 10_000_00));
    }
    months.push(...se("2026-08-01", "mtd", "2026-08-31", "2026-08-05", 3, 30_000_00, 0, 0));

    const composed = buildReportFacts(months, ytd, "SAR_MKT").sold!;
    expect(composed.soldCount).toBe(7 * 10 + 3);

    const directYtd = se("2026-01-01", "ytd", "2026-08-05", "2026-08-05", 73, 730_000_00, 7, 70_000_00);
    const direct = buildReportFacts(directYtd, ytd, "SAR_MKT").sold!;
    expect(composed.soldCount).toBe(direct.soldCount);
    expect(composed.grossSoldDollars).toBeCloseTo(direct.grossSoldDollars, 2);
  });
});
