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
    expect(src).toMatch(/label:\s*"Net \(NSA\)"[\s\S]{0,80}?netValue/);
    expect(src).toMatch(/const netValue\s*=\s*f\.netAfterCancels/);
  });

  it("every Net-bearing label on the Sold panel is a genuine net figure", () => {
    const src = readFileSync("components/scorecard/RevenueCard.tsx", "utf8");
    const netLabels = labelsIn(src).filter((l) => /\bnet\b|\bnsa\b/i.test(l));
    // "Net (NSA)"    → LP's nsa_cents (report 137)
    // "Net released" → RTP net by milestone date (report 134)
    // Both are net. Nothing else may use the word.
    expect(new Set(netLabels)).toEqual(new Set(["Net (NSA)", "Net released"]));
  });
});
