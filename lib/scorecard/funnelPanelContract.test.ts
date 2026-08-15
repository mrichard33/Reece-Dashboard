import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ④ Funnel vs Goal — the PANEL's contract, enforced (Amendments B0/B3/B4/C0).
 *
 * ══ WHY A PANEL-LEVEL TEST AND NOT ONLY PER-METRIC ONES ══
 *
 * B0: a panel must not merely contain individually valid KPIs, it must tell one
 * coherent story about one population. Every existing guard here checks a metric
 * in isolation — `labels.test.ts` that a rate names its denominator,
 * `grainContract.test.ts` that a registered metric declares its grain. Neither
 * can see the defect B0 describes, because that defect is a RELATIONSHIP between
 * rows: each of Issued, Demos and Sales was individually correct while coming
 * from a different population than the Net Sales figure beside them.
 *
 * That is not hypothetical. Until 2026-08-13 this panel read the live LP sync
 * while ⑤ By Market read report 137's cohort — 595 issued against 674 for the
 * same August, on one page, both labelled just "Issued".
 *
 * B4 adds the second half: a correct row inside a mislabelled PANEL still
 * misleads, so the subtitle is asserted too, not only the per-row labels.
 *
 * ══ WHY THIS SCANS SOURCE ══
 *
 * The panel is a server component with no test harness in this repo, and the
 * property under test is about which fields it READS — invisible to a render
 * test even if one existed. `labels.test.ts` scans component source for the same
 * kind of reason. The cost is that this test knows field names; the benefit is
 * that reintroducing `a.issued` fails the build instead of silently restoring
 * two funnels.
 */

const PANEL = join(process.cwd(), "components/scorecard/FunnelGoalTable.tsx");
const src = readFileSync(PANEL, "utf8");

/**
 * Source with comments stripped — what the panel actually DOES.
 *
 * ⚠️ Negative assertions run against this, never against `src`, and the reason
 * is the same carve-out the label guards already carry: A RETIRED NAME MAY BE
 * MENTIONED IN ORDER TO DISOWN IT. The header explains why Good Rate % was
 * removed, and why `a.demo_pct` must not feed a 137 row; scanning raw source
 * would fail on precisely the comments that stop someone undoing the change.
 * Banning the mention deletes the explanation along with the defect.
 *
 * Positive assertions keep using `src` — they look for code that exists.
 */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The `meta=` subtitle expression, which is what actually renders. */
const metaExpr = (() => {
  const i = src.indexOf("meta={");
  expect(i, "panel must set a meta subtitle").toBeGreaterThan(-1);
  return src.slice(i, src.indexOf("\n    >", i));
})();

describe("④ Funnel vs Goal — one panel, one population", () => {
  it("states its own source and cohort in the subtitle (B4)", () => {
    expect(metaExpr).toMatch(/Report 137/);
    expect(metaExpr).toMatch(/appointment-date cohort/);
  });

  it("dates the subtitle from the COHORT's coverage, not the live-sync watermark", () => {
    // `vm.snapshot.asOfDate` is when the SYNC last ran. Dating 137 figures with
    // it is the same class of error as labelling their source wrong — the two
    // genuinely differ, which is how the panel came to be a day out from ⑤.
    expect(metaExpr).toMatch(/cohortFunnel\.dataThrough/);
    expect(metaExpr).not.toMatch(/vm\.snapshot\.asOfDate/);
  });

  it("reads NO live-sync funnel field — performance rows are 137 only (B0/B5)", () => {
    // `view.actuals` is lp_market_scorecard_daily. Any of these appearing means
    // a second population has been reintroduced next to the cohort rows.
    const forbidden = [
      "a.issued",
      "a.demos",
      "a.sales",
      "a.demo_pct",
      "a.close_pct",
      "a.good_rate_pct",
      "a.ko_pct",
    ];
    const found = forbidden.filter((f) => code.includes(f));
    expect(found, `live-sync fields must not feed this panel: ${found.join(", ")}`).toEqual([]);
  });

  it("derives its rates from the cohort counts, never from a live-sync rate", () => {
    // Pairing a live-sync rate with a 137 count puts a numerator and denominator
    // from different populations in one cell — §7, one level below the panel.
    expect(src).toMatch(/const demoPct = ratio\(demos, issued\)/);
    expect(src).toMatch(/const demoToSalePct = ratio\(sales, demos\)/);
    // `d.variance.*` is `live actual − target`, so it would report a gap against
    // a number no longer on screen.
    expect(code).not.toMatch(/d\.variance\.(close_pts|demo_pts)/);
  });

  it("renders neither Good Rate % nor KO % (B3)", () => {
    // Removed, not hidden: each duplicated a contracted 137 metric with a term
    // dropped — Good Rate % is Net Retention % without Financing Denied, KO % is
    // the cancellation half of Permanent Loss %.
    expect(code).not.toMatch(/Good Rate %/);
    expect(code.match(/KO %/g) ?? []).toEqual([]);
    expect(code).not.toMatch(/METRIC_LABELS\.(goodRate|ko)\b/);
  });

  it("keeps the PLANNING row structurally separated, with its own basis (C0)", () => {
    // C0 permits a planning metric on a different cohort ONLY when the
    // distinction is structural and labelled. A footnote does not qualify.
    expect(src).toMatch(/planningRows/);
    expect(src).toMatch(/performanceRows/);
    // The LABEL itself, not the property syntax — E1 made `basis` a computed
    // string (it now appends the rate's provenance), so matching `basis: "…"`
    // tested the assignment style rather than the requirement.
    expect(src).toMatch(/"Report 135 · lead cohort · planning requirement, not a 137 target"/);
    // The rule between the blocks is derived from the block length, never a
    // literal index that silently misplaces the boundary when a row moves.
    expect(src).toMatch(/const firstPerformance = planningRows\.length/);
    expect(code).not.toMatch(/i === 4/);
  });

  it("SHIPS the Leads target, and keeps the deleted routes deleted (E0–E3)", () => {
    // E0: rendering a Leads period goal, target-to-date and pace is the founding
    // purpose of this scorecard. C1's placeholder is gone — the row no longer
    // announces a blocker, because E1 removed it by sourcing the numerator from
    // 137 and only the lead COUNT from 135.
    // On `code`, not `src`: the panel's comments narrate the history of this row
    // (including the placeholder it used to render), and that history is worth
    // keeping. What must be gone is the RENDERED string.
    expect(code).not.toMatch(/pending Report 135 validation/);
    expect(code).not.toMatch(/"grain bridge not established"/);
    expect(code).toMatch(/leadPlan/);

    // B1 — the deleted target stays deleted. `target_leads_per_day` is the same
    // defect surviving as a field on ScorecardDerived: issues-needed ÷ a
    // historical ISSUE rate, an appointment-grain numerator over a lead-grain
    // rate. It must not be read here however convenient it looks.
    expect(code).not.toMatch(/issue_rate|raw_leads_needed/);
    expect(code).not.toMatch(/target_leads_per_day/);
  });
});
