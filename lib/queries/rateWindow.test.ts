import { describe, it, expect } from "vitest";
import { computeTrailingRates, resolveRateWindow, type RateMonth } from "./scorecard";
import { cohortPerDayActuals, type PerDayRow } from "@/lib/scorecard/paceTargets";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * RULING 2026-09-18: a CLOSED period's rates (NSLI + avg sale) are FROZEN to
 * the 90 days before it began, with its own months excluded. A period that
 * reaches the current month stays LIVE (rolling 90 days ending today, current
 * month excluded). And Per-Day Pace reads the SAME Report 137 cohort counts
 * and elapsed days as Funnel vs Goal — one funnel per page.
 */

const CURRENT_MONTH = "2026-09-01";
const TODAY = "2026-09-18";

const period = (key: ResolvedPeriod["key"], periodStart: string, periodEnd: string): ResolvedPeriod => ({
  key,
  label: key,
  periodStart,
  periodEnd,
  asOf: periodEnd,
  isPartial: false,
  source: "aggregate",
});

describe("resolveRateWindow — closed periods freeze, live periods roll", () => {
  it("August (closed) freezes to the 90 days before Aug 1, excluding Aug onward", () => {
    const w = resolveRateWindow(period("select_month", "2026-08-01", "2026-08-31"), CURRENT_MONTH, TODAY);
    expect(w).toEqual({ frozen: true, windowStart: "2026-05-03", excludeFrom: "2026-08-01" });
  });

  it("current-month MTD stays live: rolling 90 days ending today, current month excluded", () => {
    const w = resolveRateWindow(period("month", "2026-09-01", "2026-09-17"), CURRENT_MONTH, TODAY);
    expect(w).toEqual({ frozen: false, windowStart: "2026-06-20", excludeFrom: "2026-09-01" });
  });

  it("YTD reaches the current month, so it stays live", () => {
    const w = resolveRateWindow(period("ytd", "2026-01-01", "2026-09-17"), CURRENT_MONTH, TODAY);
    expect(w.frozen).toBe(false);
    expect(w).toEqual({ frozen: false, windowStart: "2026-06-20", excludeFrom: "2026-09-01" });
  });

  it("no resolved period → live window (period-less read keeps current behavior)", () => {
    const w = resolveRateWindow(undefined, CURRENT_MONTH, TODAY);
    expect(w.frozen).toBe(false);
    expect(w).toEqual({ frozen: false, windowStart: "2026-06-20", excludeFrom: "2026-09-01" });
  });
});

/** Latest-first RateMonth fixtures, every month with sales ≥ 30 so the primary window is used. */
const month = (period_start: string, net: number, issued: number, sales: number): RateMonth => ({
  period_start,
  net,
  issued,
  sales,
  leads: issued * 2,
});

const MAY = month("2026-05-01", 1_000_000, 300, 80);
const JUN = month("2026-06-01", 1_200_000, 320, 90);
const JUL = month("2026-07-01", 1_100_000, 310, 85);

const fixtures = (augNet: number, sepNet: number): RateMonth[] => [
  month("2026-09-01", sepNet, 200, 40),
  month("2026-08-01", augNet, 400, 100),
  JUL,
  JUN,
  MAY,
];

describe("freeze regression — a closed month never reprices from its own or later data", () => {
  const augustWindow = resolveRateWindow(period("select_month", "2026-08-01", "2026-08-31"), CURRENT_MONTH, TODAY);
  const opts = { windowStart: augustWindow.windowStart, excludeFrom: augustWindow.excludeFrom };

  it("identical result whether Aug/Sep nets are tiny or enormous", () => {
    const quiet = computeTrailingRates(fixtures(1, 1), fixtures(1, 1), opts);
    const loud = computeTrailingRates(fixtures(50_000_000, 90_000_000), fixtures(50_000_000, 90_000_000), opts);
    expect(loud).toEqual(quiet);
  });

  it("equals the May+June+July sums (Σnet ÷ Σissued, Σnet ÷ Σsales, rounded)", () => {
    const r = computeTrailingRates(fixtures(5_000_000, 7_000_000), fixtures(5_000_000, 7_000_000), opts);
    const net = MAY.net! + JUN.net! + JUL.net!;
    const issued = MAY.issued + JUN.issued + JUL.issued;
    const sales = MAY.sales + JUN.sales + JUL.sales;
    expect(r.nsli).toBe(Math.round(net / issued));
    expect(r.avgSale).toBe(Math.round(net / sales));
    expect(r.sampleN).toBe(sales);
    expect(r.window).toBe("rolling_90d");
  });
});

describe("cohortPerDayActuals — Per-Day Pace on the Report 137 cohort", () => {
  const rows: PerDayRow[] = [
    { key: "issued", label: "Issued / day", target: 110.1, actual: 67.5 },
    { key: "demoed", label: "Demoed / day", target: 70.2, actual: 40.8 },
    { key: "closed", label: "Closed / day", target: 21.3, actual: 13.6 },
  ];
  const AUG = { issued: 2207, demos: 1411, sales: 491 };

  it("August 2026: 2,207 / 1,411 / 491 over 26 selling days → 84.9 / 54.3 / 18.9; targets untouched", () => {
    const out = cohortPerDayActuals(rows, AUG, 26);
    expect(out.map((r) => r.actual)).toEqual([84.9, 54.3, 18.9]);
    expect(out.map((r) => r.target)).toEqual([110.1, 70.2, 21.3]);
    expect(out.map((r) => r.label)).toEqual(rows.map((r) => r.label));
  });

  it("a null count is unmeasured → null actual, never 0", () => {
    const out = cohortPerDayActuals(rows, { issued: 2207, demos: null, sales: 491 }, 26);
    expect(out.map((r) => r.actual)).toEqual([84.9, null, 18.9]);
  });

  it("0 elapsed days → null actual (first of the month, no division by zero)", () => {
    const out = cohortPerDayActuals(rows, AUG, 0);
    expect(out.map((r) => r.actual)).toEqual([null, null, null]);
  });

  it("a row with an unknown key is returned unchanged", () => {
    const odd: PerDayRow = { key: "leads", label: "Leads / day", target: 5, actual: 4.2 };
    const out = cohortPerDayActuals([...rows, odd], AUG, 26);
    expect(out[3]).toEqual(odd);
    expect(out[3]).toBe(odd);
  });
});
