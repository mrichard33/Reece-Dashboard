import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePeriod } from "./resolvePeriod";
import {
  resolveSellingCalendar,
  todayET,
  firstOfMonthET,
  sellingDaysElapsed,
} from "./sellingDays";

/**
 * Clock-pinned checks for the locked period definitions (handoff tests 1–4):
 *   1. Aug 4 → MTD = Aug 1–3, elapsed = completed selling days only (today never
 *      counts). Selling-day basis (Mon–Sat minus Reece closures) per Assumption
 *      A2: Sat Aug 1 + Mon Aug 3 = 2 (Sun Aug 2 is not a selling day).
 *   2. Aug 1 → no completed days yet; nothing divides by zero.
 *   3. Aug 4 02:00 UTC = Aug 3 22:00 ET → still resolves against ET, not UTC.
 *   4. Three Months = rolling 3 calendar months incl. current; YTD = Jan 1 →
 *      yesterday.
 */

const cal = resolveSellingCalendar({});

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

afterEach(() => {
  vi.useRealTimers();
});

describe("MTD on Aug 4 (ET)", () => {
  it("resolves Aug 1–3 with 2 completed selling days — today never elapses", () => {
    at("2026-08-04T12:00:00-04:00");
    const r = resolvePeriod("month", {}, cal);
    expect(r.periodStart).toBe("2026-08-01");
    expect(r.asOf).toBe("2026-08-03"); // yesterday ET, a Monday
    expect(r.label).toContain("Aug 1–3");
    // Selling-day basis (A2): Sat Aug 1 + Mon Aug 3; Sunday Aug 2 excluded.
    expect(sellingDaysElapsed(r.periodStart, r.asOf, cal)).toBe(2);
  });
});

describe("MTD on Aug 1 (ET) — no completed days yet", () => {
  it("resolves an empty completed range (asOf before periodStart), elapsed 0", () => {
    at("2026-08-01T09:00:00-04:00");
    const r = resolvePeriod("month", {}, cal);
    expect(r.periodStart).toBe("2026-08-01");
    expect(r.asOf < r.periodStart).toBe(true); // last completed day is in July
    expect(r.label).toContain("no completed days yet");
    expect(sellingDaysElapsed(r.periodStart, r.asOf, cal)).toBe(0);
  });
});

describe("ET vs UTC day boundary", () => {
  it("02:00 UTC on Aug 4 is still Aug 3 in ET — MTD ends Aug 1, not Aug 3", () => {
    at("2026-08-04T02:00:00Z"); // Aug 3 22:00 ET
    expect(todayET()).toBe("2026-08-03");
    const r = resolvePeriod("month", {}, cal);
    expect(r.periodStart).toBe("2026-08-01");
    // Yesterday ET from Aug 3 skips Sunday Aug 2 → Sat Aug 1.
    expect(r.asOf).toBe("2026-08-01");
  });

  it("firstOfMonthET stays on the ET month late on a month's last evening", () => {
    at("2026-08-01T01:00:00Z"); // Jul 31 21:00 ET — UTC has rolled to August
    expect(firstOfMonthET()).toBe("2026-07-01");
  });
});

describe("Three Months and YTD on Aug 4 (ET)", () => {
  it("trailing_3m = Jun 1 → yesterday (rolling 3 calendar months incl. current)", () => {
    at("2026-08-04T12:00:00-04:00");
    const r = resolvePeriod("trailing_3m", {}, cal);
    expect(r.periodStart).toBe("2026-06-01");
    expect(r.asOf).toBe("2026-08-03");
    expect(r.source).toBe("aggregate");
  });

  it("ytd = Jan 1 → yesterday, aggregate (frozen months + live current month)", () => {
    at("2026-08-04T12:00:00-04:00");
    const r = resolvePeriod("ytd", {}, cal);
    expect(r.periodStart).toBe("2026-01-01");
    expect(r.asOf).toBe("2026-08-03");
    expect(r.source).toBe("aggregate");
  });
});
