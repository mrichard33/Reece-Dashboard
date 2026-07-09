import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { resolveSellingCalendar } from "./sellingDays";
import { resolvePeriod } from "./resolvePeriod";

// Mon–Sat, default Reece closures (none in June 2026). Fix "now" to Wed 2026-06-24
// (noon UTC = 8am ET) so todayET() = 2026-06-24 and the last completed selling day
// is Tue 2026-06-23 (Sun 06-21 is not a selling day).
const cal = resolveSellingCalendar({});

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("resolvePeriod", () => {
  it("defaults to month-to-date snapshot when key is missing/unknown", () => {
    for (const key of [undefined, "", "bogus"]) {
      const r = resolvePeriod(key, {}, cal);
      expect(r.key).toBe("month");
      expect(r.source).toBe("snapshot");
      expect(r.periodStart).toBe("2026-06-01");
      expect(r.periodEnd).toBe("2026-06-23"); // last completed selling day
      expect(r.asOf).toBe("2026-06-23");
      expect(r.isPartial).toBe(false);
      expect(r.label).toContain("June 2026 (MTD)");
    }
  });

  it("today → partial single-day recompute", () => {
    const r = resolvePeriod("today", {}, cal);
    expect(r.source).toBe("recompute");
    expect(r.periodStart).toBe("2026-06-24");
    expect(r.periodEnd).toBe("2026-06-24");
    expect(r.isPartial).toBe(true);
  });

  it("yesterday → last completed selling day", () => {
    const r = resolvePeriod("yesterday", {}, cal);
    expect(r.source).toBe("recompute");
    expect(r.periodStart).toBe("2026-06-23");
    expect(r.periodEnd).toBe("2026-06-23");
    expect(r.isPartial).toBe(false);
  });

  it("week → Monday through last completed selling day (recompute)", () => {
    const r = resolvePeriod("week", {}, cal);
    expect(r.source).toBe("recompute");
    expect(r.periodStart).toBe("2026-06-22"); // Monday of the current week
    expect(r.periodEnd).toBe("2026-06-23");
  });

  it("last_week → previous Mon–Sat (recompute)", () => {
    const r = resolvePeriod("last_week", {}, cal);
    expect(r.source).toBe("recompute");
    expect(r.periodStart).toBe("2026-06-15");
    expect(r.periodEnd).toBe("2026-06-20"); // previous Saturday
  });

  it("trailing_3m → current + 2 prior full months through last completed selling day (aggregate)", () => {
    const r = resolvePeriod("trailing_3m", {}, cal);
    expect(r.source).toBe("aggregate");
    expect(r.periodStart).toBe("2026-04-01"); // April (June minus 2 months), first of month
    expect(r.periodEnd).toBe("2026-06-23");
    expect(r.label).toContain("April 2026–June 2026");
  });

  it("qtd → quarter start through last completed selling day (aggregate)", () => {
    const r = resolvePeriod("qtd", {}, cal);
    expect(r.source).toBe("aggregate");
    expect(r.periodStart).toBe("2026-04-01"); // Q2 start
    expect(r.periodEnd).toBe("2026-06-23");
  });

  it("ytd → Jan 1 through last completed selling day (aggregate)", () => {
    const r = resolvePeriod("ytd", {}, cal);
    expect(r.source).toBe("aggregate");
    expect(r.periodStart).toBe("2026-01-01");
    expect(r.periodEnd).toBe("2026-06-23");
  });

  it("last_month → full previous month (aggregate)", () => {
    const r = resolvePeriod("last_month", {}, cal);
    expect(r.source).toBe("aggregate");
    expect(r.periodStart).toBe("2026-05-01");
    expect(r.periodEnd).toBe("2026-05-31");
  });

  it("select_month → full past month from YYYY-MM (aggregate)", () => {
    const r = resolvePeriod("select_month", { start: "2026-03" }, cal);
    expect(r.source).toBe("aggregate");
    expect(r.periodStart).toBe("2026-03-01");
    expect(r.periodEnd).toBe("2026-03-31");
  });

  it("select_month for the current month caps at last completed selling day", () => {
    const r = resolvePeriod("select_month", { start: "2026-06" }, cal);
    expect(r.periodStart).toBe("2026-06-01");
    expect(r.periodEnd).toBe("2026-06-23");
  });

  it("custom with valid bounds → recompute over the given window", () => {
    const r = resolvePeriod("custom", { start: "2026-02-10", end: "2026-02-20" }, cal);
    expect(r.source).toBe("recompute");
    expect(r.periodStart).toBe("2026-02-10");
    expect(r.periodEnd).toBe("2026-02-20");
  });

  it("custom with invalid/missing bounds falls back to month snapshot", () => {
    for (const bounds of [{}, { start: "2026-02-10" }, { start: "2026-03-01", end: "2026-02-01" }]) {
      const r = resolvePeriod("custom", bounds, cal);
      expect(r.key).toBe("month");
      expect(r.source).toBe("snapshot");
    }
  });
});
