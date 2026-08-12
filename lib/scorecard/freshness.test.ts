import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshnessChip,
  stalenessSellingDays,
  stalenessPhrase,
  stalenessCalendarDays,
  stalenessPhraseFull,
} from "./freshness";
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

// ── Partial coverage ────────────────────────────────────────────────────────
//
// `is_partial_month` has been computed and stored on every snapshot since
// 2026-08-06 (lp_is_partial_coverage: the file's ET generation date <= its own
// period_end). Nothing ever read it. Under the rolling daily schedule a partial
// file would publish a short day as if it were a whole one, and the only visible
// symptom would be a dip that looks like a bad day of selling.

describe("freshnessChip — partial coverage", () => {
  it("says Partial through, not Data through", () => {
    const chip = freshnessChip({
      asOfDate: "2026-08-11",
      computedFrom: null,
      isPartial: true,
      partialThrough: "2026-08-10",
    });
    expect(chip.text).toBe("Partial through 08-10-2026 · Partial");
    expect(chip.tone).toBe("amber");
  });

  it("outranks computed_from — a partial file is never an exact closed month", () => {
    // net_report_rtp normally renders emerald "Net Report actual". A file that
    // does not cover its own period cannot be the exact reading of it.
    const chip = freshnessChip({
      asOfDate: "2026-08-11",
      computedFrom: "net_report_rtp",
      isPartial: true,
      partialThrough: "2026-08-10",
    });
    expect(chip.text).toContain("Partial");
    expect(chip.text).not.toContain("Net Report actual");
    expect(chip.tone).toBe("amber");
  });

  it("falls back to asOfDate when no period_end is supplied", () => {
    const chip = freshnessChip({ asOfDate: "2026-08-10", computedFrom: null, isPartial: true });
    expect(chip.text).toBe("Partial through 08-10-2026 · Partial");
  });

  it("treats NULL as unknown, never as false", () => {
    // Legacy PDF snapshots carry no reliable generation time, so is_partial_month
    // is NULL. Rendering those as "Partial" would cry wolf on every historical
    // month; rendering them as partial-free is the existing, correct behaviour.
    const unknown = freshnessChip({ asOfDate: "2026-08-10", computedFrom: null, isPartial: null });
    expect(unknown.text).toBe("Data through 08-10-2026 · Provisional");

    const explicitlyWhole = freshnessChip({
      asOfDate: "2026-08-10", computedFrom: null, isPartial: false, partialThrough: "2026-08-10",
    });
    expect(explicitlyWhole.text).toBe("Data through 08-10-2026 · Provisional");
  });

  it("still never says Live", () => {
    const chip = freshnessChip({
      asOfDate: "2026-08-11", computedFrom: null, isPartial: true, partialThrough: "2026-08-10",
    });
    expect(chip.text.toLowerCase()).not.toContain("live");
  });
});

describe("§Freshness — calendar age is a second unit, not a replacement", () => {
  /**
   * The banner read "3 selling days behind" above a figure that was five
   * calendar days old, and that gap is what made it look like it was
   * understating the lag. Both units are correct; they answer different
   * questions, so both are shown.
   */
  it("counts calendar days to TODAY, not to the last completed selling day", () => {
    // Aug 6 → Aug 11 is 5 calendar days, and 3 selling days (Aug 7, 8, 10):
    // Aug 9 is a Sunday and Aug 11 has not completed.
    expect(stalenessCalendarDays("2026-08-06", "2026-08-11")).toBe(5);
    expect(stalenessSellingDays("2026-08-06", "2026-08-10", CAL)).toBe(3);
  });

  it("a figure keeps ageing over a weekend even though no selling happens", () => {
    // Fri Aug 7 → Mon Aug 10: one selling day missed (Aug 8), three days old.
    expect(stalenessSellingDays("2026-08-07", "2026-08-10", CAL)).toBe(2);
    expect(stalenessCalendarDays("2026-08-07", "2026-08-10")).toBe(3);
  });

  it("is 0, never negative, when the data is current or ahead", () => {
    expect(stalenessCalendarDays("2026-08-11", "2026-08-11")).toBe(0);
    expect(stalenessCalendarDays("2026-08-12", "2026-08-11")).toBe(0);
  });

  it("is null when there is no date to compare", () => {
    expect(stalenessCalendarDays(null, "2026-08-11")).toBeNull();
  });

  it("the combined phrase carries BOTH units", () => {
    expect(stalenessPhraseFull(3, 5)).toBe("3 selling days behind, 5 calendar days old");
    expect(stalenessPhraseFull(1, 1)).toBe("1 selling day behind, 1 calendar day old");
  });

  it("degrades to whichever unit is known, and says nothing when current", () => {
    expect(stalenessPhraseFull(3, null)).toBe("3 selling days behind");
    expect(stalenessPhraseFull(0, 2)).toBe("2 calendar days old");
    expect(stalenessPhraseFull(0, 0)).toBeNull();
    expect(stalenessPhraseFull(null, null)).toBeNull();
  });
});

describe("§Freshness — the banner must not implicate the Net Sales headline", () => {
  const PAGE = "app/(dashboard)/scorecard/page.tsx";
  const src = readFileSync(PAGE, "utf8");

  it("never claims the whole page is behind", () => {
    // It said "Live-sync figures are behind." above a current headline, because
    // the banner outlived the RTP tile it was written to caveat.
    expect(src).not.toMatch(/Live-sync figures are behind/);
  });

  it("scopes the revenue watermark to the Released panel", () => {
    expect(src).toMatch(/affects the Released panel only/);
  });

  /**
   * ⚠️ REWRITTEN 2026-08-13, deliberately.
   *
   * The banner used to assert "Net Sales, the goal and the pace are unaffected"
   * as fixed copy. That was a promise the page could not keep — it was true on
   * the day it was written and would have gone on printing if Net Sales ever DID
   * fall behind. The banner now enumerates only the sources actually behind the
   * cutoff, which is a strictly stronger version of the same intent: an
   * unaffected source is not reassured about, it is simply absent.
   *
   * These assertions moved with it. They pin the mechanism, not the sentence.
   */
  it("names the lagging SOURCES rather than asserting which ones are fine", () => {
    // Driven off the clock's own lists — nothing here can go stale relative to
    // the data the way a hardcoded reassurance did.
    expect(src).toMatch(/clock\.lagging/);
    expect(src).toMatch(/clock\.refused/);
    expect(src).toMatch(/clock\.bySource\[id\]\.note/);
    // The retired promise must not come back as copy.
    expect(src).not.toMatch(/Net Sales, the goal and the pace are unaffected/);
  });

  it("cites the date the current-period figures actually COVER, not the run date", () => {
    // The defect in one line: `observed_on` (08-11, when LP ran the report) was
    // the only date the view exposed, so the page dated 08-10 data as 08-11.
    expect(src).toMatch(/clock\.cutoff\.achieved/);
    expect(src).toMatch(/netSalesThrough/);
    expect(src).not.toMatch(/const cohortAsOf/);
  });

  it("still shows both staleness units — now via the clock's badge", () => {
    // stalenessPhraseFull moved into lagBadge() so one wording serves the
    // banner, the chip and the hero tile instead of three copies.
    const clockSrc = readFileSync("lib/scorecard/reportingClock.ts", "utf8");
    expect(clockSrc).toMatch(/stalenessPhraseFull\(/);
    expect(clockSrc).toMatch(/stalenessSellingDays\(/);
    expect(clockSrc).toMatch(/stalenessCalendarDays\(/);
  });

  it("renders ONE cutoff chip, not two showing the same date", () => {
    // There were two: "as of 08-10-2026" and "Data through 08-10-2026 ·
    // Provisional", neither of which was the date the headline covered.
    expect(src).toMatch(/clockChip\(clock\.cutoff\)/);
    expect(src).not.toMatch(/\{isStale \? "data through" : "as of"\}/);
  });
});
