import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * §Naming — "Gross after cancels" is not "Net Sales".
 *
 * NSA subtracts cancellations, credit declines, holds AND working.
 * Gross-after-cancels subtracts cancellations only. Both are legitimate; they
 * are not the same number. Fort Myers, 2026-08 MTD:
 *
 *   Gross written        $873,208
 *   Gross after cancels  $844,765   (gross − cancelled $28,443)
 *   LP net (NSA)         $343,676
 *   difference is mostly working    $466,188
 *
 * ~$501K apart on one market. Sharing a label between them is how July's
 * apparent net-to-gross collapse to 50.9% read as lost business when it was
 * $2.6M sitting in hold and working.
 *
 * This test guards the LABELS a reader actually sees. Prose in comments and
 * popover copy legitimately discusses both terms together; what must never
 * happen is a rendered row calling `gross − cancelled` Net or NSA.
 */

const ROOTS = ["components", "lib", "app"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Source with comments removed. A rule about what RENDERS must not fire on a
 * comment that merely discusses the thing — this file's own explanations name
 * every figure it forbids. Same approach as labels.test.ts.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every `label: "…"` string literal in a source file. */
function labelsIn(src: string): string[] {
  return [...src.matchAll(/\blabel:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

const FILES = ROOTS.flatMap((r) => {
  try {
    return walk(r);
  } catch {
    return [];
  }
});

describe("§Naming — no rendered label calls gross−cancelled Net or NSA", () => {
  it("finds source files to scan (the scan is not vacuously passing)", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('no component renders the old "Net sales after cancels" label', () => {
    // The exact label that used to sit on an NSA value.
    const offenders = FILES.filter((f) =>
      labelsIn(readFileSync(f, "utf8")).some((l) => /net\b.*after cancels/i.test(l)),
    );
    expect(offenders).toEqual([]);
  });

  it("the Sold panel labels gross−cancelled as Gross after cancels", () => {
    const src = readFileSync("components/scorecard/RevenueCard.tsx", "utf8");
    const labels = labelsIn(src);
    expect(labels).toContain("Gross after cancels");
    // And the value bound to that label is the gross-after-cancels field, not NSA.
    expect(src).toMatch(/label:\s*"Gross after cancels"[\s\S]{0,120}?f\.grossAfterCancels/);
  });

  it("reserves Net / NSA for LP's nsa_cents", () => {
    const src = readFileSync("components/scorecard/RevenueCard.tsx", "utf8");
    // The NSA row carries the word Net and is bound to netAfterCancels.
    expect(src).toMatch(/label:\s*"Net \(Report 137 NSA\)"[\s\S]{0,80}?netValue/);
    expect(src).toMatch(/const netValue\s*=\s*f\.netAfterCancels/);
  });

  it("every Net-bearing label on the Sold panel is a genuine net figure", () => {
    const src = readFileSync("components/scorecard/RevenueCard.tsx", "utf8");
    const netLabels = labelsIn(src).filter((l) => /\bnet\b|\bnsa\b/i.test(l));
    // "Net (NSA)"    → LP's nsa_cents (report 137)
    // "Net released" → RTP net by milestone date (report 134)
    // Both are net. Nothing else may use the word.
    expect(new Set(netLabels)).toEqual(new Set(["Net (Report 137 NSA)", "Net released"]));
  });
});

/**
 * §Naming (2026-08-12) — the Net Sales basis.
 *
 * Five dollar figures now describe one month's selling, and four of them could
 * plausibly be called "net". Fort Myers, August 2026:
 *
 *     Gross Written        $873,208
 *     Gross after cancels  $844,765
 *     NET SALES            $821,484   ← the goal-bearing one
 *     Net (NSA)            $343,676
 *
 * Types cannot express "this string must not appear next to that value", and
 * `vitest.config.ts` collects `lib/**` only, so no component test can run.
 * A source scan is the only way to prove the copy that actually renders is
 * right.
 */
describe("§Naming — Net Sales is defined wherever it is named", () => {
  const PANELS = "components/scorecard/CohortPanels.tsx";
  const HERO = "components/scorecard/PaceHero.tsx";

  it("the hero's Net Sales tile states the subtraction, not just the word", () => {
    const src = readFileSync(HERO, "utf8");
    expect(src).toMatch(/label:\s*`Net Sales \$\{vm\.abbr\}`/);
    // The sub-line has to carry the definition — "Net Sales" alone is exactly
    // as ambiguous as the "Net" it replaced.
    expect(src).toMatch(/gross written − cancellations − financing denied/i);
  });

  it("RTP is not a fallback for the hero — there is no substitution path at all", () => {
    const src = code(readFileSync(HERO, "utf8"));
    // A labelled fallback was tried and rejected: RTP is a different economic
    // event, and putting it in the most important position on a SALES scorecard
    // misreports the month even when the label says so. Unavailable renders as
    // unavailable.
    expect(src).toMatch(/value: pending \? "Unavailable"/);
    expect(src).toMatch(/source temporarily unavailable/);
    // No RTP figure may be read into the hero's actual under any branch.
    expect(src).not.toMatch(/p\.netSales/);
    expect(src).not.toMatch(/released to production/i);
    expect(src).not.toMatch(/Net — Released/);
  });

  it("the unavailable state carries the last known as-of, not a bare dash", () => {
    const src = readFileSync(HERO, "utf8");
    expect(src).toMatch(/netSalesAsOf/);
    expect(src).toMatch(/last read \$\{shortDate\(netSalesAsOf\)\}/);
  });

  it("the cohort table distinguishes all four dollar columns by name", () => {
    const src = readFileSync(PANELS, "utf8");
    for (const label of ["Gross Written", "Net Sales", "Lost", "Pending", "Net (Report 137 NSA)"]) {
      expect(src).toContain(`>\n                ${label}\n              </th>`);
    }
  });

  /**
   * The By-Market cards, added 2026-08-13.
   *
   * ⚠️ These are `toContain` / `not.toMatch` source scans rather than
   * `labelsIn()` assertions, and that is deliberate: `labelsIn()` only matches
   * `label: "…"` object literals, so a `<th>` and a mobile-card kicker are
   * INVISIBLE to it. That blind spot is why these cards went on rendering "NET
   * RELEASED MTD" for a day after the hero moved to Net Sales, and why nothing
   * in this file failed. Closing it explicitly.
   */
  const BY_MARKET = "components/scorecard/ByMarketTable.tsx";

  it("the market cards are on the same basis as the hero, not RTP", () => {
    const src = code(readFileSync(BY_MARKET, "utf8"));
    expect(src).toMatch(/Net Sales \{abbr\}/); // mobile card kicker
    expect(src).toMatch(/>\s*Net Sales\s*</); // desktop <th>
    // The retired label, in either casing, on the market table.
    expect(src).not.toMatch(/[Nn]et released/);
  });

  it("the market column states the subtraction, and names financing denied", () => {
    const src = readFileSync(BY_MARKET, "utf8");
    // "Net Sales" alone is as ambiguous as the "Net" it replaced, and
    // gross − cancels is a DIFFERENT figure — the definition must name all
    // three terms.
    expect(src).toMatch(/Gross Written − Cancellations − Financing Denied/i);
    expect(src).not.toMatch(/RELEASED to production in this period/i);
  });

  it("the market query reads report 137, never released_dollars", () => {
    // The defect in one line: `numOr0(a.released_dollars ?? a.net_sales)` on a
    // table whose `net_sales` column IS `released_dollars`. Orlando rendered
    // net $179,726 against gross $127,023 — net exceeding gross, impossible on
    // a sales basis. Comments stripped so the explanation above the code cannot
    // satisfy the assertion.
    const src = code(readFileSync("lib/queries/byMarket.ts", "utf8"));
    expect(src).not.toMatch(/released_dollars/);
    expect(src).toMatch(/netSalesCents/);
    // And the guard that would have caught it is actually wired, not just
    // exported — it had zero production call sites when this shipped.
    expect(src).toMatch(/assertNetActualMetric\(/);
  });

  it("an unmeasured market renders unmeasured, never $0", () => {
    const src = code(readFileSync("lib/queries/byMarket.ts", "utf8"));
    // numOr0 on the dollar figures is what turned "no cohort row" into a
    // confident zero — and a market at $0 against a goal reads as total failure
    // rather than as not-yet-sourced.
    expect(src).toMatch(/net_sales: number \| null/);
    expect(src).toMatch(/gross_sales: number \| null/);
    expect(src).not.toMatch(/net_sales: numOr0/);
  });

  it("no rendered copy calls gross−cancelled 'Net Sales'", () => {
    // gross − cancelled omits financing denials and is $23K adrift on one
    // market in one month. It is never the goal basis.
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/Net Sales[^"\n]{0,40}gross\s*[−-]\s*cancels/i);
    }
  });
});

describe("§8 — no copy may imply Expected Settled Net measures quality", () => {
  const PANELS = "components/scorecard/CohortPanels.tsx";

  it("says outright that it is a forecast and cannot reward better selling", () => {
    const src = readFileSync(PANELS, "utf8");
    expect(src).toMatch(/NOT A QUALITY METRIC|not a quality metric/i);
    // The mechanism, in the reader's own words: at fixed volume it cannot move.
    expect(src).toMatch(/Writing more raises it/i);
    expect(src).toMatch(/writing better does not/i);
  });

  it("never attaches a quality verb to the modeled figure", () => {
    const src = readFileSync(PANELS, "utf8");
    // The forbidden claim, in the shapes it would actually be written.
    expect(src).not.toMatch(/Expected Mature Net[^.]{0,60}\b(measures|rewards|improves)\b/i);
  });

  it("carries its sample size in cohorts and dollars, not in observations", () => {
    const src = code(readFileSync(PANELS, "utf8"));
    expect(src).toMatch(/eligible cohort/);
    expect(src).toMatch(/written/);
    // Re-reading one cohort five times is five observations and ONE sample.
    expect(src).not.toMatch(/n=\{|observations\b/);
  });
});

describe("§2 — a modeled figure is never labelled a goal without naming the real one", () => {
  const PANELS = "components/scorecard/CohortPanels.tsx";

  it("names the actual stored goal in the tile label, never a constant", () => {
    const src = readFileSync(PANELS, "utf8");
    // The label interpolates the goal it was computed from.
    expect(src).toMatch(/Expected Settled Value at the \$\{goalName\} goal/);
    expect(src).toMatch(/const goalName/);
  });

  it("says explicitly that the modeled figure is NOT a goal", () => {
    const src = readFileSync(PANELS, "utf8");
    expect(src).toMatch(/This is NOT a goal/);
  });

  it('never uses the retired "implied net goal" framing', () => {
    for (const f of FILES) {
      expect(readFileSync(f, "utf8")).not.toMatch(/implied net goal/i);
    }
  });

  it("$10.4M is not hardcoded anywhere as a goal — the goal is per-month", () => {
    // Jan–Jul 2026 are $10,400,000; August is $11,012,374 and Sep–Dec differ
    // again. A constant would silently misreport eight months of the year.
    for (const f of FILES) {
      const src = code(readFileSync(f, "utf8"));
      expect(src).not.toMatch(/10[,_]?400[,_]?000/);
      expect(src).not.toMatch(/\$10\.4M/);
    }
  });
});
