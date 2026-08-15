import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ⑤ By Market renders TWICE, and both renderings must carry the same figures.
 *
 * ══ THE DEFECT ══
 *
 * The table is `hidden lg:block`; every viewport under 1024px gets
 * `renderMobileCard` instead. When the Leads requirement (E3) shipped, it was
 * added to the desktop `<td>` and not to the card — so on a phone, which is
 * where this page is most often read, the figure simply did not exist. It read
 * as "still missing" after being shipped and deployed, and nothing failed.
 *
 * ══ THE RULE ══
 *
 * A field added to one rendering goes in both. This test cannot know what the
 * next field will be, so it pins the ones that exist and fails loudly if a
 * rendering drops one.
 *
 * Source-scanned for the same reason the other panel contracts are: these are
 * server components with no render harness in this repo, and the property under
 * test is which fields each branch READS.
 */

const PANEL = join(process.cwd(), "components/scorecard/ByMarketTable.tsx");
const src = readFileSync(PANEL, "utf8");

/** The two rendering branches, split at the desktop row builder. */
const splitAt = src.indexOf("const renderRow");
const mobile = src.slice(src.indexOf("const renderMobileCard"), splitAt);
const desktop = src.slice(splitAt);

describe("By Market — phone and desktop show the same figures", () => {
  it("both renderings exist and were found", () => {
    expect(splitAt).toBeGreaterThan(0);
    expect(mobile.length).toBeGreaterThan(200);
    expect(desktop.length).toBeGreaterThan(200);
  });

  // Every per-row figure that must survive a viewport change. Add to this list
  // when a column is added — that is the point of the test.
  const SHARED_FIELDS = [
    "r.leads",
    "r.leads_target_to_date",
    "r.leads_pace_delta",
    "r.leads_rate_own",
    "r.issued",
    "r.demos",
    "r.sales",
    "r.demo_pct",
    "r.demo_to_sale_pct",
    "r.gross_sales",
    "r.net_sales",
  ] as const;

  for (const field of SHARED_FIELDS) {
    it(`${field} renders on the phone card, not only the table`, () => {
      expect(mobile).toContain(field);
    });
    it(`${field} renders in the desktop row, not only the card`, () => {
      expect(desktop).toContain(field);
    });
  }

  it("REGRESSION: the Leads requirement is on the phone card", () => {
    // The specific miss. E3 shipped to the table alone and was invisible on
    // mobile — deployed, correct server-side, and unreadable where it mattered.
    expect(mobile).toMatch(/Leads needed/);
    expect(mobile).toMatch(/leads_target_to_date/);
  });

  it("a borrowed company rate is disclosed in BOTH renderings", () => {
    // A borrowed figure must never render as a measured one, on either surface.
    expect(mobile).toMatch(/co rate/);
    expect(desktop).toMatch(/co rate/);
  });
});
