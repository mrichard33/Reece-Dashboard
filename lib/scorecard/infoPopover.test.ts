/**
 * §Mobile — the ⓘ popover must be reachable on a phone.
 *
 * Reported 2026-08-12: "when I click on the info buttons on mobile the pop up
 * is always cut off the screen." Two independent causes, both in
 * `components/help/InfoPopover.tsx`:
 *
 *   1. A fixed `w-80` (320px) panel positioned absolutely off a 20px trigger.
 *      On a ~390px viewport it runs past whichever edge the trigger sits near;
 *      `align="left"` overflows the right edge almost everywhere.
 *   2. An absolutely-positioned child CANNOT escape an ancestor with
 *      `overflow-x-auto` — which is every table on the scorecard. Those ⓘ
 *      buttons opened into a clipped strip, or nothing at all.
 *
 * `vitest.config.ts` collects `lib/**` only and runs in a node env, so no
 * component test can render this. A source scan is the only way to prove the
 * fix is still present — and CSS regressions here are silent, which is exactly
 * why the guard is worth having.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync("components/help/InfoPopover.tsx", "utf8");

/**
 * Source with comments removed. The component's own comment explains the bug
 * and therefore names `w-80` in prose; a rule about which CLASSES render must
 * not fire on the sentence describing why they changed. Same approach as
 * labelDiscipline.test.ts.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("§Mobile — InfoPopover escapes overflow ancestors", () => {
  it("positions the panel against the VIEWPORT below sm", () => {
    // `fixed` is the whole fix: it cannot be clipped by a scroll container and
    // cannot exceed the screen. If this reverts to a bare `absolute`, every ⓘ
    // inside a table breaks again.
    expect(SRC).toMatch(/className=\{cn\(\s*\n\s*"fixed inset-x-4 bottom-4/);
  });

  it("bounds its height and scrolls internally rather than overflowing", () => {
    expect(SRC).toMatch(/max-h-\[70vh\] overflow-y-auto/);
  });

  it("restores the anchored popover at sm and up, unchanged", () => {
    expect(SRC).toMatch(/sm:absolute/);
    expect(SRC).toMatch(/sm:top-full/);
    expect(SRC).toMatch(/sm:w-80/);
    // The align prop still drives left/right — at sm+ only.
    expect(SRC).toMatch(/align === "right" \? "sm:right-0" : "sm:left-0"/);
  });

  it("never sizes the mobile panel with a fixed width", () => {
    // A `w-80` that is not sm-scoped is the original bug.
    expect(CODE).not.toMatch(/(?<!sm:)\bw-80\b/);
  });

  it("has a tap-to-close backdrop on mobile only", () => {
    expect(SRC).toMatch(/fixed inset-0 z-40 .*sm:hidden/);
    expect(SRC).toMatch(/onClick=\{\(\) => setOpen\(false\)\}/);
  });

  it("layers the panel above its own backdrop", () => {
    // Backdrop z-40, panel z-50; at sm+ the panel drops back to z-40 and the
    // backdrop is hidden entirely.
    expect(SRC).toMatch(/bottom-4 z-50/);
    expect(SRC).toMatch(/sm:z-40/);
  });
});

describe("§Mobile — the tables that made this necessary still scroll", () => {
  /**
   * Anti-vacuity. The popover fix only matters because these exist; if the
   * overflow containers were removed the guard above would silently stop
   * guarding anything real.
   */
  const TABLES = [
    "components/scorecard/CohortPanels.tsx",
    "components/scorecard/ByMarketTable.tsx",
    "components/scorecard/SourcePerformanceTable.tsx",
  ];

  it("at least one scorecard table is an overflow container", () => {
    const scrolling = TABLES.filter((f) => /overflow-x-auto/.test(readFileSync(f, "utf8")));
    expect(scrolling.length).toBeGreaterThan(0);
  });

  it("the cohort table renders an ⓘ, which is the case that was broken", () => {
    const src = readFileSync("components/scorecard/CohortPanels.tsx", "utf8");
    expect(src).toMatch(/<InfoPopover/);
  });
});

describe("§Mobile — no other component hardcodes an off-screen panel width", () => {
  const ROOTS = ["components", "app"];
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(p, out);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }
  const FILES = ROOTS.flatMap((r) => {
    try {
      return walk(r);
    } catch {
      return [];
    }
  });

  it("finds source files to scan (the scan is not vacuously passing)", () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it("any fixed-width overlay wider than a phone is sm-scoped", () => {
    // w-96 = 384px, wider than a 390px viewport once padding is counted.
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} hardcodes an unscoped w-96 overlay`).not.toMatch(
        /(?<!sm:)(?<!md:)(?<!lg:)\bw-96\b/,
      );
    }
  });
});
