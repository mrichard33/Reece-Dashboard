import { afterEach, describe, expect, it, vi } from "vitest";
import { fullPeriodBounds } from "./scorecardAggregate";
import { resolvePeriod, type PeriodKey } from "@/lib/date/resolvePeriod";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
} from "@/lib/date/sellingDays";
import { prorateGoal } from "@/lib/scorecard/paceTargets";

/**
 * §1 — ONE period basis drives every derived figure.
 *
 * THE DEFECT (live, 2026-08-06): the YTD view divided by a FULL-YEAR
 * denominator while its goal summed only eight months.
 *
 *     Projected Pace   $53,044,056 ÷ 183 × 305 = $88,406,760   ← above goal
 *     Target to Date   $75,538,446 ÷ $84,455,826 = 89.4%       ← 8-month basis
 *     Elapsed          183 / 305 = 60%
 *     Balance          −$22,494,390                            ← behind
 *
 * Two elapsed fractions on one screen: the projection divided by the smaller
 * one and rendered ABOVE goal while Balance correctly said the company was
 * $22.5M behind. `fullPeriodBounds` returned [Jan 1, Dec 31] for YTD.
 *
 * THE RULE (now uniform for every period key): the full period is the span of
 * WHOLE MONTHS the period goal sums over — start month through end month. The
 * goal window and the clock window are the same window, so target-to-date and
 * projected pace cannot disagree by construction.
 */

const cal = resolveSellingCalendar({});

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

afterEach(() => {
  vi.useRealTimers();
});

/** Last day of the month containing `ymd`. */
const monthEndOf = (ymd: string): string =>
  new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), 0, 12))
    .toISOString()
    .slice(0, 10);

const KEYS: PeriodKey[] = ["month", "trailing_3m", "qtd", "ytd", "select_month", "last_month"];

describe("§1 invariant — totalUnits never exceeds what the resolved period end implies", () => {
  // The invariant the handoff asks for, stated as code: a YTD period ending in
  // August spans ~205 selling days (Jan–Aug), NEVER the 305 of a whole year.
  for (const key of KEYS) {
    it(`${key}: the full period never runs past the end of its own end month`, () => {
      at("2026-08-06T12:00:00-04:00");
      const r = resolvePeriod(key, { start: "2026-08-01" }, cal);
      const [fullStart, fullEnd] = fullPeriodBounds(r);

      expect(fullStart).toBe(r.periodStart);
      expect(fullEnd).toBe(monthEndOf(r.periodEnd));
      expect(fullEnd >= r.periodEnd).toBe(true);

      const totalUnits = sellingDaysInPeriod(fullStart, fullEnd, cal);
      const implied = sellingDaysInPeriod(r.periodStart, monthEndOf(r.periodEnd), cal);
      expect(totalUnits).toBeLessThanOrEqual(implied);

      // Elapsed can never exceed the total it is measured against.
      const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);
      expect(elapsed).toBeLessThanOrEqual(totalUnits);
    });
  }

  it("YTD stops at the end of the CURRENT month, not December", () => {
    at("2026-08-06T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    const [start, end] = fullPeriodBounds(r);
    expect(start).toBe("2026-01-01");
    expect(end).toBe("2026-08-31");
    expect(end).not.toBe("2026-12-31"); // the defect

    const total = sellingDaysInPeriod(start, end, cal);
    expect(total).toBeLessThan(250); // ~205, nowhere near a full year's 305
  });

  it("QTD stops at the end of the current month, not the end of the quarter", () => {
    at("2026-08-06T12:00:00-04:00");
    const [, end] = fullPeriodBounds(resolvePeriod("qtd", {}, cal));
    expect(end).toBe("2026-08-31");
    expect(end).not.toBe("2026-09-30"); // the same defect, same direction
  });

  it("trailing_3m keeps the behaviour it already had (it was the correct one)", () => {
    at("2026-08-06T12:00:00-04:00");
    const [start, end] = fullPeriodBounds(resolvePeriod("trailing_3m", {}, cal));
    expect(start).toBe("2026-06-01");
    expect(end).toBe("2026-08-31");
  });
});

describe("§1 — projected pace and target-to-date share one elapsed fraction", () => {
  /**
   * Reproduces the live 2026-08-06 YTD reading end to end. The elapsed and total
   * counts come from the shared period object, so the projection and the
   * to-date target are two views of ONE fraction rather than two pipelines.
   */
  const NET_RELEASED = 53_044_056;
  const PERIOD_GOAL = 83_200_000; // 8 × $10,400,000 post-Lakeland carve

  it("the YTD projection lands near $59M, not $88M", () => {
    at("2026-08-06T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    const [fullStart, fullEnd] = fullPeriodBounds(r);
    const total = sellingDaysInPeriod(fullStart, fullEnd, cal);
    const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);

    const projected = Math.round((NET_RELEASED / elapsed) * total);

    // The old full-year denominator produced $88,406,760 — above goal, while
    // Balance said −$22.5M on the same screen.
    const oldWrong = Math.round((NET_RELEASED / elapsed) * 305);
    expect(oldWrong).toBeGreaterThan(PERIOD_GOAL);

    expect(projected).toBeGreaterThan(55_000_000);
    expect(projected).toBeLessThan(64_000_000);
    // and it must agree with Balance: short of goal.
    expect(projected).toBeLessThan(PERIOD_GOAL);
  });

  it("projection ÷ goal equals actual ÷ target-to-date — one fraction, two views", () => {
    at("2026-08-06T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    const [fullStart, fullEnd] = fullPeriodBounds(r);
    const total = sellingDaysInPeriod(fullStart, fullEnd, cal);
    const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);

    const projected = (NET_RELEASED / elapsed) * total;
    const targetToDate = prorateGoal(PERIOD_GOAL, elapsed, total)!;

    // Both sides reduce to the same ratio when one shared fraction drives them.
    expect(projected / PERIOD_GOAL).toBeCloseTo(NET_RELEASED / targetToDate, 6);
  });

  it("a projection that beats goal and a balance that is negative cannot coexist", () => {
    at("2026-08-06T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    const [fullStart, fullEnd] = fullPeriodBounds(r);
    const total = sellingDaysInPeriod(fullStart, fullEnd, cal);
    const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);

    const projected = (NET_RELEASED / elapsed) * total;
    const balance = NET_RELEASED - prorateGoal(PERIOD_GOAL, elapsed, total)!;

    // This is the contradiction the screen showed on 2026-08-06.
    expect(Math.sign(projected - PERIOD_GOAL)).toBe(Math.sign(balance));
  });

  it("elapsed % is taken against the same total the projection expands to", () => {
    at("2026-08-06T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    const [fullStart, fullEnd] = fullPeriodBounds(r);
    const total = sellingDaysInPeriod(fullStart, fullEnd, cal);
    const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);

    const elapsedPct = (elapsed / total) * 100;
    const goalPct = (prorateGoal(PERIOD_GOAL, elapsed, total)! / PERIOD_GOAL) * 100;

    // 60% vs 89.4% was the visible symptom. They are now the same number.
    expect(elapsedPct).toBeCloseTo(goalPct, 6);
    expect(elapsedPct).toBeGreaterThan(80);
  });
});

describe("§1 — no completed selling days yet", () => {
  it("MTD on the 1st divides by nothing and yields null, never Infinity", () => {
    at("2026-08-01T09:00:00-04:00");
    const r = resolvePeriod("month", {}, cal);
    const [fullStart, fullEnd] = fullPeriodBounds(r);
    const total = sellingDaysInPeriod(fullStart, fullEnd, cal);
    const elapsed = sellingDaysElapsed(r.periodStart, r.asOf, cal);

    expect(elapsed).toBe(0);
    expect(total).toBeGreaterThan(0);
    // prorateGoal returns 0 for "nothing expected yet"; the projection is the
    // side that must refuse to compute rather than divide by zero.
    expect(prorateGoal(PERIOD_GOAL_MONTH, elapsed, total)).toBe(0);
    expect(elapsed > 0 ? (1 / elapsed) * total : null).toBeNull();
  });
});

const PERIOD_GOAL_MONTH = 10_400_000;
