import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ③ Sold this period — the PANEL's sourcing contract.
 *
 * ══ THE DEFECT ══
 *
 * The card fell back PER ROW. When no report-137 snapshot covered the period,
 * "Total sales count" and "Gross sales value" quietly switched to the live LP
 * sync while "Cancellations" and "Net (Report 137 NSA)" — which have no
 * live-sync equivalent — rendered "not yet sourced" and a bare dash.
 *
 * Observed 2026-08: the card showed 142 sales / $3,278,106 from the sync
 * directly above two rows labelled "Report 137" showing nothing, while 137's own
 * answer for that same period was 150 / $3,408,689. Nothing on the card said the
 * top half had changed basis, so it read as broken rather than mixed — and the
 * two counts are close enough that no one would catch it by eye.
 *
 * ══ THE RULE ══
 *
 * One basis per card, decided once, stated on the card face. A reader who
 * screenshots the panel must be able to see which system answered.
 *
 * Scans source for the same reason `funnelPanelContract.test.ts` does: the panel
 * is a server component with no render harness here, and the property under test
 * is which fields it READS.
 */

const PANEL = join(process.cwd(), "components/scorecard/RevenueCard.tsx");
const src = readFileSync(PANEL, "utf8");
/** Source with comments stripped — what the panel actually DOES. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Sold this period — one basis per card", () => {
  it("announces the fallback on the CARD, not only behind the ⓘ", () => {
    // Lineage stays in the popover by design. A FALLBACK is not lineage — it is
    // an exception, and it has to survive being screenshotted.
    expect(code).toMatch(/banner=\{/);
    expect(code).toMatch(/Report 137 has not landed for this period/);
    // Conditional on the basis, never permanent chrome.
    expect(code).toMatch(/soldSourced\s*\n?\s*\?\s*null/);
  });

  it("names the live sync on the rows that came from it", () => {
    expect(code).toMatch(/const SYNC = "live LP sync"/);
    expect(code).toMatch(/note: soldSourced \? undefined : SYNC/);
  });

  it("says what the 137-only rows NEED, not a bare 'not yet sourced'", () => {
    // "Not yet sourced" beside a populated Lost card reads as a contradiction:
    // the number plainly exists two cards down. Naming the missing REPORT is
    // actionable; naming the absence is not.
    expect(code).toMatch(/const NEEDS_137 = "needs report 137"/);
    expect(code).toMatch(/note: soldSourced \? "gross − cancels − financing denied" : NEEDS_137/);
  });

  it("never fills a 137-only row from the sync", () => {
    // The failure mode this whole change exists to prevent: a sync number
    // rendered under a "Report 137" label. Both rows must render "—" instead.
    expect(code).toMatch(/value: soldSourced \? netValue : "—"/);
  });
});

describe("Cancellations live on exactly ONE card", () => {
  it("the Sold card does NOT list cancellations", () => {
    // They belong to "Lost this period", which owns loss and splits it by cause.
    // Listing them here too put the same 8 jobs / $242,976 under two headings
    // from two different reports (137 here, 133 there) — duplication when the
    // reports agree, and a visible contradiction the moment they do not.
    expect(code).not.toMatch(/label: "Cancellations"/);
  });

  it("keeps the EFFECT of cancellations in the sold waterfall", () => {
    // Removing the line item must not remove the result: the card still has to
    // show what survives, or the waterfall has a hole in it. Net Sales IS that
    // result — gross minus BOTH loss terms, which is what the old
    // "Gross after cancels" row failed to be.
    expect(code).toMatch(/label: "Net Sales"/);
    expect(code).not.toMatch(/label: "Gross after cancels"/);
  });

  it("shows Working + Hold as IN FLIGHT, never subtracted from Net Sales", () => {
    // This is the whole $2.4M gap that made LP's NSA look like a collapse.
    // Beside net, not inside it.
    expect(code).toMatch(/label: "Not yet released"/);
    expect(code).toMatch(/in flight, not lost/);
    expect(code).toMatch(/f\.notYetReleased/);
  });

  it("the Lost card still carries the cause split", () => {
    expect(code).toMatch(/lostLines|Lost this period/);
  });
});
