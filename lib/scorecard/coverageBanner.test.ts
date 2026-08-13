import { describe, expect, it } from "vitest";
import { shouldShowCoverageBanner, monthsInRange } from "./coverageBanner";

const base = {
  periodIncludesToday: true,
  laggingCount: 0,
  refusedCount: 0,
  missingMonths: [] as string[],
};

describe("D2 — a closed period raises no coverage banner", () => {
  it("THE CASE: a fully closed month with a lagging source renders nothing", () => {
    // The defect verbatim: July selected, the banner announcing "every
    // current-period figure is reported through 07-31-2026". July ended on the
    // 31st, so reaching it is completeness, not staleness.
    expect(
      shouldShowCoverageBanner({ ...base, periodIncludesToday: false, laggingCount: 2 }),
    ).toBe(false);
  });

  it("a closed period suppresses a REFUSED source too", () => {
    // Same reasoning, and deliberately not an exception: once a period is
    // closed, how far a source runs says nothing about the figures on screen.
    // Hard integrity problems keep their own separate (rose) banner.
    expect(
      shouldShowCoverageBanner({ ...base, periodIncludesToday: false, refusedCount: 1 }),
    ).toBe(false);
  });

  it("an OPEN period still raises on a lagging or refused source", () => {
    expect(shouldShowCoverageBanner({ ...base, laggingCount: 1 })).toBe(true);
    expect(shouldShowCoverageBanner({ ...base, refusedCount: 1 })).toBe(true);
  });

  it("an open period with everything current raises nothing", () => {
    expect(shouldShowCoverageBanner(base)).toBe(false);
  });

  it("a MISSING month raises even on a closed period", () => {
    // A hole is not a clock reading. A period total that silently omits a month
    // understates without saying so, and closing the period does not fix that.
    expect(
      shouldShowCoverageBanner({
        ...base,
        periodIncludesToday: false,
        missingMonths: ["2026-03"],
      }),
    ).toBe(true);
  });

  it("RTP is absent from the gate entirely (D1)", () => {
    // There is no RTP input to pass. Report 134 feeds exactly one panel, so its
    // note lives on that panel — a page-level banner that has to tell you it
    // affects one panel is not a page-level concern. This test exists so that
    // re-adding an RTP term here fails review rather than passing silently.
    expect(Object.keys(base).sort()).toEqual([
      "laggingCount",
      "missingMonths",
      "periodIncludesToday",
      "refusedCount",
    ]);
  });
});

describe("monthsInRange", () => {
  it("names every month a period should contain", () => {
    expect(monthsInRange("2026-01-01", "2026-03-31")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("a single month is one month, not zero", () => {
    expect(monthsInRange("2026-07-01", "2026-07-31")).toEqual(["2026-07"]);
  });

  it("crosses a year boundary", () => {
    expect(monthsInRange("2025-11-01", "2026-02-28")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("is bounded — a decade-wide range cannot spin", () => {
    expect(monthsInRange("2000-01-01", "2099-12-31").length).toBe(120);
  });
});
