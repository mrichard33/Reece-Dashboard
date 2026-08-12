import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { prorateGoal, revenueAnchorDate } from "./paceTargets";
import { shortDate } from "@/lib/utils";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
} from "@/lib/date/sellingDays";

/**
 * §O — a revenue figure and the target it is measured against must reach the
 * SAME date.
 *
 * The defect: on 2026-08-11 `lp_market_scorecard_daily` carried
 * max(as_of_date) = 2026-08-10 but max(revenue_as_of) = 2026-08-06. Counts had
 * caught up; revenue had not. Net Released MTD divided money settled through
 * Aug 6 by a target prorated to Aug 10, so every market read "behind pace"
 * regardless of performance — Fort Lauderdale at 5% of target, Lakeland at 0%.
 *
 * These tests pin the alignment at the arithmetic level, using the real selling
 * calendar rather than hand-counted day numbers, so a calendar change cannot
 * quietly invalidate them.
 *
 * See docs/revenue-as-of.md.
 */

const CAL = resolveSellingCalendar();

// August 2026, the month the defect was found in.
const AUG_START = "2026-08-01";
const AUG_END = "2026-08-31";
const REVENUE_AS_OF = "2026-08-06"; // Net Report coverage end
const PERIOD_AS_OF = "2026-08-10"; // how far the COUNTS reach
const FTMYR_MONTHLY_GOAL = 2_600_000;

describe("§O — the August 2026 selling-day facts the fix rests on", () => {
  it("has 26 selling days, 5 through Aug 6 and 8 through Aug 10", () => {
    expect(sellingDaysInPeriod(AUG_START, AUG_END, CAL)).toBe(26);
    expect(sellingDaysElapsed(AUG_START, REVENUE_AS_OF, CAL)).toBe(5);
    expect(sellingDaysElapsed(AUG_START, PERIOD_AS_OF, CAL)).toBe(8);
  });

  it("resolves the documented off-by-one: $700,000 was 7 days, not 8", () => {
    // The panel read "8 / 26 elapsed" beside a $700,000 target — exactly 7/26 of
    // $2.6M. Neither figure was assumed correct. 8 is the true elapsed count
    // through Aug 10, so the $700,000 came from a snapshot still holding
    // days_elapsed = 7 (through Aug 8) — a stale feed, not a calendar error.
    expect(sellingDaysElapsed(AUG_START, "2026-08-08", CAL)).toBe(7);
    expect(Math.round(prorateGoal(FTMYR_MONTHLY_GOAL, 7, 26)!)).toBe(700_000);
    expect(Math.round(prorateGoal(FTMYR_MONTHLY_GOAL, 8, 26)!)).toBe(800_000);
  });
});

describe("§O3 — revenueAnchorDate", () => {
  it("uses the revenue date when it trails the period as-of", () => {
    expect(revenueAnchorDate(PERIOD_AS_OF, REVENUE_AS_OF)).toBe(REVENUE_AS_OF);
  });

  it("falls back to the period as-of when no report has landed", () => {
    // A period with no Net Report must behave exactly as it did before this
    // existed — never a $0 target, never a null.
    expect(revenueAnchorDate(PERIOD_AS_OF, null)).toBe(PERIOD_AS_OF);
  });

  it("never runs ahead of the period as-of", () => {
    // A report covering past the end of a narrow range must not inflate that
    // range's target.
    expect(revenueAnchorDate("2026-08-10", "2026-08-31")).toBe("2026-08-10");
  });
});

describe("§O3 — the revenue target prorates to revenue_as_of, not period_end", () => {
  /** The fix, expressed exactly as the query layer computes it. */
  const revenueTarget = (goal: number, revenueAsOf: string | null, periodAsOf: string): number => {
    const anchor = revenueAnchorDate(periodAsOf, revenueAsOf);
    const elapsed = sellingDaysElapsed(AUG_START, anchor, CAL);
    const days = sellingDaysInPeriod(AUG_START, AUG_END, CAL);
    return Math.round(prorateGoal(goal, elapsed, days) ?? 0);
  };

  it("Fort Myers reads $500,000, not $800,000", () => {
    // THE headline assertion from the brief: $2.6M × 5/26.
    expect(revenueTarget(FTMYR_MONTHLY_GOAL, REVENUE_AS_OF, PERIOD_AS_OF)).toBe(500_000);
  });

  it("FAILS if it prorates to the period as-of instead", () => {
    // The guard the brief asks for: the same computation anchored to the count
    // date produces a materially different number, so a regression that reverts
    // the anchor cannot pass the test above.
    const wrong = Math.round(prorateGoal(FTMYR_MONTHLY_GOAL, 8, 26) ?? 0);
    expect(wrong).toBe(800_000);
    expect(revenueTarget(FTMYR_MONTHLY_GOAL, REVENUE_AS_OF, PERIOD_AS_OF)).not.toBe(wrong);
  });

  it("a revenue date trailing the period by 3 selling days prorates to the revenue date", () => {
    // Aug 10 (8 elapsed) vs Aug 5 (5 elapsed)… Aug 5 is 4 elapsed; pick the pair
    // that differ by exactly 3 and assert the target follows the earlier one.
    const trailing = "2026-08-06"; // 5 elapsed — three selling days behind Aug 10's 8
    expect(
      sellingDaysElapsed(AUG_START, PERIOD_AS_OF, CAL) -
        sellingDaysElapsed(AUG_START, trailing, CAL),
    ).toBe(3);
    expect(revenueTarget(1_000_000, trailing, PERIOD_AS_OF)).toBe(
      Math.round(prorateGoal(1_000_000, 5, 26)!),
    );
  });

  it("the numerator and denominator reach the same date, per market", () => {
    // "A tile's revenue as-of and its target as-of are equal, asserted per
    // tile." Each market's revenue figure is stamped with the same Net Report
    // date, so each market's target must resolve to that same anchor.
    const markets = [
      { code: "FTMYR_MKT", goal: 2_600_000, revenueAsOf: REVENUE_AS_OF },
      { code: "FTLAU_MKT", goal: 1_000_000, revenueAsOf: REVENUE_AS_OF },
      { code: "LAKE_MKT", goal: 138_724, revenueAsOf: null }, // no report → count basis
    ];
    for (const m of markets) {
      const anchor = revenueAnchorDate(PERIOD_AS_OF, m.revenueAsOf);
      expect(anchor).toBe(m.revenueAsOf ?? PERIOD_AS_OF);
      const elapsed = sellingDaysElapsed(AUG_START, anchor, CAL);
      expect(revenueTarget(m.goal, m.revenueAsOf, PERIOD_AS_OF)).toBe(
        Math.round(prorateGoal(m.goal, elapsed, 26)!),
      );
    }
  });

  it("O4 — the revenue watermark string is still derived once, from revenue_as_of", () => {
    // AMENDED 2026-08-12. This used to assert that the hero's headline tile read
    // "released through Aug 6". That tile is gone: the hero's actual is now Net
    // Sales, which is dated by CONTRACT date and has no coverage watermark of
    // its own, so there is no RTP date left in the hero to align. The watermark
    // still governs the Released panel, and the derivation is still single-
    // sourced here for the branch that renders it.
    expect(shortDate(REVENUE_AS_OF)).toBe("Aug 6");

    const src = readFileSync("components/scorecard/PaceHero.tsx", "utf8");
    expect(src).toMatch(/const revThrough\s*=\s*p\.revenueAsOf\s*\?\s*`through \$\{shortDate\(p\.revenueAsOf\)\}`/);
    // Never the snapshot's own as-of, whichever tile consumes it.
    expect(src).not.toMatch(/released \$\{[^}]*snapshot\.asOfDate/);
  });

  it("O4 — on the Net Sales basis the target stops where the ACTUAL stops", () => {
    // The replacement guarantee. `p.paceGoal` prorates to the Net Report's
    // watermark, which is correct for an RTP actual and wrong for this one:
    // Net Sales reaches the cohort's as-of, typically several selling days
    // later. Measuring 8 days of actual against 5 days of target would flatter
    // Balance by ~38%, so the target is re-prorated to the elapsed selling days.
    const src = readFileSync("components/scorecard/PaceHero.tsx", "utf8");
    expect(src).toMatch(/const targetToDate\s*=\s*onNetSales/);
    expect(src).toMatch(/prorateGoal\(p\.monthlyGoal, p\.daysElapsed, p\.sellingDays\)/);
    // Balance must consume the aligned target, not the RTP-anchored one.
    expect(src).toMatch(/const balance\s*=\s*Math\.round\(actual - targetToDate\)/);
  });

  it("O4 — shortDate is calendar-safe and omits the year", () => {
    // Parsed by slicing, not via new Date(): a Date built from a bare calendar
    // date shifts a day backwards west of UTC, which would label Aug 6 "Aug 5".
    expect(shortDate("2026-08-06")).toBe("Aug 6");
    expect(shortDate("2026-01-01")).toBe("Jan 1");
    expect(shortDate("2026-12-31")).toBe("Dec 31");
    expect(shortDate(null)).toBe("—");
    expect(shortDate("not-a-date")).toBe("—");
  });

  it("Fort Lauderdale stops reading 5% of target once the bases agree", () => {
    // The market the brief singles out. Released $13,830 against a $1M month.
    const released = 13_830;
    const misaligned = (released / Math.round(prorateGoal(1_000_000, 8, 26)!)) * 100;
    const aligned = (released / revenueTarget(1_000_000, REVENUE_AS_OF, PERIOD_AS_OF)) * 100;
    expect(Math.round(misaligned * 10) / 10).toBe(4.5); // the "5% of target" row
    expect(Math.round(aligned * 10) / 10).toBe(7.2);
    // Still a bad month — the fix makes it honest, not flattering.
    expect(aligned).toBeGreaterThan(misaligned);
  });
});
