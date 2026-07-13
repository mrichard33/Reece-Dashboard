import { describe, it, expect } from "vitest";
import { resolveSellingCalendar, sellingDaysInPeriod, sellingDaysElapsed } from "./sellingDays";
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
