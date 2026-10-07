import { describe, it, expect } from "vitest";
import { addDays, buildDailyTrend, aiUsd, latencyLabel } from "./llmUsage.core";

describe("buildDailyTrend", () => {
  const today = "2026-10-07";

  it("starts at the first recorded day and fills quiet days with zero", () => {
    const t = buildDailyTrend(
      [
        { day: "2026-10-05", calls: 4, cost: 0.2 },
        { day: today, calls: 2, cost: 0.1 },
      ],
      today,
    );
    expect(t.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(t[1]).toEqual({ date: "2026-10-06", calls: 0, cost: null });
  });

  it("sums rows for the same day and keeps an unpriced day NULL, not $0", () => {
    const t = buildDailyTrend(
      [
        { day: today, calls: 3, cost: 0.25 },
        { day: today, calls: 5, cost: null },
        { day: "2026-10-06", calls: 9, cost: null },
      ],
      today,
    );
    expect(t).toEqual([
      { date: "2026-10-06", calls: 9, cost: null },
      { date: today, calls: 8, cost: 0.25 },
    ]);
  });

  it("is empty with no rows", () => {
    expect(buildDailyTrend([], today)).toEqual([]);
  });
});

describe("formatters", () => {
  it("aiUsd shows cents, never $0 for a real cost, and a dash when unpriced", () => {
    expect(aiUsd(12.345)).toBe("$12.35");
    expect(aiUsd(0.43)).toBe("$0.43");
    expect(aiUsd(0.004)).toBe("<$0.01");
    expect(aiUsd(0)).toBe("$0.00");
    expect(aiUsd(null)).toBe("—");
  });

  it("latencyLabel", () => {
    expect(latencyLabel(640)).toBe("640ms");
    expect(latencyLabel(2450)).toBe("2.5s");
    expect(latencyLabel(null)).toBe("—");
  });

  it("addDays crosses month ends", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-10-07", -29)).toBe("2026-09-08");
  });
});
