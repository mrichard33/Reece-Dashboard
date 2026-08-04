import { describe, it, expect } from "vitest";
import { computeTrailingRates, resolveRateAnchor, type RateMonth } from "./scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

/**
 * The period-scoped rate anchor (D3): rates price a period from the months
 * strictly BEFORE its first month, so MTD and YTD reprice with different
 * windows on the SAME warehouse data (handoff test 23), while a period-less
 * read keeps the current-month behavior (test 26 regression guard).
 */

const period = (key: ResolvedPeriod["key"], periodStart: string, periodEnd: string): ResolvedPeriod => ({
  key,
  label: key,
  periodStart,
  periodEnd,
  asOf: periodEnd,
  isPartial: false,
  source: "snapshot",
});

describe("resolveRateAnchor — period-scoped (D3)", () => {
  it("anchors at the period's first month: MTD-Aug vs YTD get different anchors", () => {
    const mtd = resolveRateAnchor(period("month", "2026-08-01", "2026-08-31"));
    const ytd = resolveRateAnchor(period("ytd", "2026-01-01", "2026-08-04"));
    expect(mtd).toEqual({ anchorMonth: "2026-08-01", periodScoped: true });
    expect(ytd).toEqual({ anchorMonth: "2026-01-01", periodScoped: true });
    expect(mtd.anchorMonth).not.toBe(ytd.anchorMonth);
  });

  it("a past select_month anchors at that month (stable no matter when viewed)", () => {
    const june = resolveRateAnchor(period("select_month", "2026-06-01", "2026-06-30"));
    expect(june).toEqual({ anchorMonth: "2026-06-01", periodScoped: true });
  });

  it("no resolved period → current ET month, periodScoped false (test 26 fallback)", () => {
    const fallback = resolveRateAnchor(undefined);
    expect(fallback.periodScoped).toBe(false);
    expect(fallback.anchorMonth).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe("MTD vs YTD produce different rates on the same fixture data (test 23)", () => {
  // 12 months of warehouse history where the recent months (May–Jul) perform
  // differently from the earlier ones (Oct–Dec 2025) — so the two anchors'
  // windows MUST price differently.
  const ALL_MONTHS: RateMonth[] = [
    { period_start: "2026-07-01", net: 400_000, issued: 80, sales: 20, leads: 160 },
    { period_start: "2026-06-01", net: 380_000, issued: 76, sales: 19, leads: 152 },
    { period_start: "2026-05-01", net: 360_000, issued: 72, sales: 18, leads: 144 },
    { period_start: "2026-04-01", net: 250_000, issued: 60, sales: 14, leads: 130 },
    { period_start: "2026-03-01", net: 240_000, issued: 58, sales: 13, leads: 128 },
    { period_start: "2026-02-01", net: 230_000, issued: 56, sales: 13, leads: 126 },
    { period_start: "2026-01-01", net: 220_000, issued: 54, sales: 12, leads: 124 },
    { period_start: "2025-12-01", net: 200_000, issued: 50, sales: 12, leads: 125 },
    { period_start: "2025-11-01", net: 190_000, issued: 48, sales: 11, leads: 120 },
    { period_start: "2025-10-01", net: 180_000, issued: 46, sales: 11, leads: 118 },
  ];

  /** Months strictly before the anchor — exactly what the anchored query returns. */
  const before = (anchorMonth: string) => ALL_MONTHS.filter((m) => m.period_start < anchorMonth);

  it("the August MTD window (May–Jul) and the YTD window (Oct–Dec 2025) price differently", () => {
    const mtdAnchor = resolveRateAnchor(period("month", "2026-08-01", "2026-08-31"));
    const ytdAnchor = resolveRateAnchor(period("ytd", "2026-01-01", "2026-08-04"));

    const mtdRates = computeTrailingRates(before(mtdAnchor.anchorMonth), before(mtdAnchor.anchorMonth));
    const ytdRates = computeTrailingRates(before(ytdAnchor.anchorMonth), before(ytdAnchor.anchorMonth));

    // MTD prices from May–Jul 2026: Σnet 1,140,000 ÷ Σissued 228 = 5000.
    expect(mtdRates.window).toBe("trailing_3");
    expect(mtdRates.nsli).toBe(5000);
    // YTD prices from Oct–Dec 2025: Σnet 570,000 ÷ Σissued 144 ≈ 3958.
    expect(ytdRates.window).toBe("trailing_3");
    expect(ytdRates.nsli).toBe(Math.round(570_000 / 144));

    expect(mtdRates.nsli).not.toBe(ytdRates.nsli);
    expect(mtdRates.issueRate).not.toBe(ytdRates.issueRate);
    expect(mtdRates.avgSale).not.toBe(ytdRates.avgSale);
  });
});
