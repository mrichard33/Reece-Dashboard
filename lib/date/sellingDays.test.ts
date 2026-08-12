import { describe, it, expect } from "vitest";
import {
  resolveSellingCalendar,
  sellingDaysInPeriod,
  sellingDaysElapsed,
  lastCompletedSellingDay,
  isSellingDay,
} from "./sellingDays";
import { reeceHolidays } from "./holidays";

// Default calendar (no env override) = Mon–Sat minus the frozen holidays.ts list.
const cal = resolveSellingCalendar({});

/** Selling days in calendar month `m` of 2026. */
function monthDays(m: number): number {
  const start = `2026-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(2026, m, 0, 12, 0, 0)).toISOString().slice(0, 10);
  return sellingDaysInPeriod(start, end, cal);
}

describe("Reece selling-day calendar (2026)", () => {
  // The locked working-days table — July MUST equal 26, year MUST equal 305.
  const EXPECTED: Record<number, number> = {
    1: 26, 2: 24, 3: 26, 4: 26, 5: 25, 6: 26,
    7: 26, 8: 26, 9: 25, 10: 27, 11: 23, 12: 25,
  };

  it("has exactly 8 frozen closures in 2026", () => {
    expect(reeceHolidays(2026).size).toBe(8);
  });

  it.each(Object.entries(EXPECTED))("month %s has the locked working-day count", (m, days) => {
    expect(monthDays(Number(m))).toBe(days);
  });

  it("July 2026 is 26 working days (regression guard — never 22 Mon–Fri, never off-by-one)", () => {
    expect(monthDays(7)).toBe(26);
  });

  it("the full year 2026 is 305 working days", () => {
    expect(sellingDaysInPeriod("2026-01-01", "2026-12-31", cal)).toBe(305);
  });

  it("YTD elapsed through 2026-07-11 is 162 selling days (not 163)", () => {
    // Memorial Day (May 25) is a closure, which is what pulls the old 163 → 162.
    expect(sellingDaysElapsed("2026-01-01", "2026-07-11", cal)).toBe(162);
  });

  it("counts July 3 (observed Independence Day) as a closure, not July 4", () => {
    expect(cal.holidays(2026).has("2026-07-03")).toBe(true);
    expect(cal.holidays(2026).has("2026-07-04")).toBe(false);
  });
});

/**
 * §17 — the elapsed-days rules that pace arithmetic depends on.
 *
 * Every target-to-date is `monthly_goal × elapsed ÷ working_days`, so anything
 * that moves `elapsed` moves the target, and a target that moves for the wrong
 * reason is worse than no target.
 */
describe("§3 — elapsed selling days: today never counts, and a stale feed cannot shrink them", () => {
  it("August 2026 has 26 selling days", () => {
    expect(sellingDaysInPeriod("2026-08-01", "2026-08-31", cal)).toBe(26);
  });

  it("TODAY NEVER COUNTS — the anchor is the last COMPLETED selling day", () => {
    // A day in progress is not a day of results. Counting it prorates the
    // target over a day the numerator has not finished earning against, so
    // every market reads behind every morning.
    //
    // Wednesday 2026-08-12: the last completed selling day is Tuesday the 11th.
    const anchor = lastCompletedSellingDay("2026-08-12", cal);
    expect(anchor).toBe("2026-08-11");
    expect(anchor < "2026-08-12").toBe(true);
  });

  it("skips backwards over a closure rather than landing on one", () => {
    // The day after Independence Day observed (Fri 2026-07-03 is a closure):
    // Saturday the 4th is a selling day in the Mon–Sat calendar, so from
    // Sunday the 5th the last completed one is the 4th, not the 3rd.
    const anchor = lastCompletedSellingDay("2026-07-05", cal);
    expect(isSellingDay(anchor, cal)).toBe(true);
  });

  it("A STALE FEED DOES NOT REDUCE ELAPSED DAYS — the calendar is not the data", () => {
    // The defect: `days_elapsed` used to come from the LP-MCP snapshot, so a
    // feed that stopped advancing froze it. On 2026-08-11 the tile read "6 of
    // 26" while eight selling days had actually passed — and because the target
    // prorates over that number, a stalled feed shrank the target in step with
    // the missing actuals and a real miss rendered as on-pace.
    //
    // sellingDaysElapsed takes a DATE, not a row, so it cannot be frozen by a
    // feed. Whatever the snapshot claims, the calendar answers the same.
    const throughTheEleventh = sellingDaysElapsed("2026-08-01", "2026-08-11", cal);
    const staleSnapshotClaims = 6;
    expect(throughTheEleventh).toBeGreaterThan(staleSnapshotClaims);
    expect(throughTheEleventh).toBe(9);
  });

  it("0 completed days on the first of a period — never coerced to 1", () => {
    // Dividing by a fabricated 1 turns "no data yet" into a per-day rate.
    expect(sellingDaysElapsed("2026-08-01", "2026-07-31", cal)).toBe(0);
  });
});
