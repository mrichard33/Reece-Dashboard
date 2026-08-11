import { describe, expect, it } from "vitest";
import { freshnessChip, stalenessSellingDays, stalenessPhrase } from "./freshness";
import { resolveSellingCalendar } from "@/lib/date/sellingDays";

// ── §6 — the freshness chip says the date, and never says "Live" ───────────
//
// It read "live · provisional" on 2026-08-10, while `lp_market_scorecard_daily`
// had not advanced since 2026-08-07. "Live" described a table that had been
// still for four days, and "provisional" was defined nowhere a reader could
// reach.

const CAL = resolveSellingCalendar({ SCORECARD_SELLING_DAYS: "mon,tue,wed,thu,fri,sat", SCORECARD_HOLIDAYS: "none" });

describe("§6 — freshness chip", () => {
  it("leads with the actual as-of date and never says 'Live'", () => {
    const chip = freshnessChip({ asOfDate: "2026-08-07", computedFrom: "lp_api" });
    expect(chip.text).toBe("Data through 08-07-2026 · Provisional");
    expect(chip.text.toLowerCase()).not.toContain("live");
  });

  it("defines 'provisional' in the tooltip rather than assuming it is known", () => {
    const chip = freshnessChip({ asOfDate: "2026-08-07", computedFrom: "lp_api" });
    expect(chip.title).toMatch(/not yet reconciled/i);
    expect(chip.title).toMatch(/Net Report/);
  });

  it("distinguishes a closed report-sourced month from an estimate", () => {
    const closed = freshnessChip({ asOfDate: "2026-07-31", computedFrom: "net_report_rtp" });
    expect(closed.text).toBe("Data through 07-31-2026 · Net Report actual");
    expect(closed.tone).toBe("emerald");
    expect(closed.title).not.toMatch(/estimate for/i);

    const mixed = freshnessChip({ asOfDate: "2026-08-07", computedFrom: "mixed" });
    expect(mixed.text).toBe("Data through 08-07-2026 · Report + provisional");
    expect(mixed.tone).toBe("amber");
  });

  it("says so when there is no date at all, rather than inventing one", () => {
    expect(freshnessChip({ asOfDate: null, computedFrom: null }).text).toBe("No data · Provisional");
  });

  it("never contains the word 'Live' on any branch", () => {
    for (const cf of ["net_report_rtp", "mixed", "lp_api", null]) {
      expect(freshnessChip({ asOfDate: "2026-08-07", computedFrom: cf }).text.toLowerCase()).not.toContain("live");
    }
  });
});

describe("§6 — staleness measured in selling days", () => {
  // Mon–Sat selling, no holidays. 2026-08-07 is a Friday; 2026-08-10 a Monday.
  it("counts selling days strictly after the data date", () => {
    // Fri 08-07 data, last completed selling day Sat 08-08 → 1 day behind.
    expect(stalenessSellingDays("2026-08-07", "2026-08-08", CAL)).toBe(1);
    // …through Mon 08-10 → Sat + Mon = 2 (Sunday is not a selling day).
    expect(stalenessSellingDays("2026-08-07", "2026-08-10", CAL)).toBe(2);
  });

  it("reports 0 — not 1 — when the data reaches the last completed day", () => {
    // A snapshot written this morning for yesterday is up to date.
    expect(stalenessSellingDays("2026-08-10", "2026-08-10", CAL)).toBe(0);
    expect(stalenessSellingDays("2026-08-11", "2026-08-10", CAL)).toBe(0);
  });

  it("is null when there is no data date to compare", () => {
    expect(stalenessSellingDays(null, "2026-08-10", CAL)).toBeNull();
  });

  it("phrases the gap, and stays silent when current", () => {
    expect(stalenessPhrase(2)).toBe("2 selling days behind");
    expect(stalenessPhrase(1)).toBe("1 selling day behind");
    expect(stalenessPhrase(0)).toBeNull();
    expect(stalenessPhrase(null)).toBeNull();
  });
});
