/**
 * §Popover — the ⓘ must be readable wherever it is rendered.
 *
 * TWO REPORTS, ONE ROOT CAUSE, SIX HOURS APART.
 *
 * 2026-08-12 (morning): "when I click on the info buttons on mobile the pop up
 * is always cut off the screen."
 * 2026-08-12 (same day, after the first fix shipped): "the scorecard pop-up
 * icon on desktop is now cutting off. It is also cutting off in the boxes
 * labeled Sold this period / Released this period / Lost this period / Open
 * backlog. I think it is being contained in the box."
 *
 * The root cause of both is one CSS fact: an absolutely-positioned child
 * CANNOT escape an ancestor that clips (`overflow-hidden`, `overflow-x-auto`).
 * The scorecard is built out of such ancestors, and — this is the part the
 * first fix missed — several of them are DESKTOP-ONLY:
 *
 *   · RevenueCard's SplitCard   overflow-hidden                (all widths)
 *   · ByMarketTable             hidden overflow-x-auto lg:block
 *   · SourcePerformanceTable    hidden overflow-x-auto sm:block
 *   · LeadCostTable             hidden overflow-x-auto lg:block
 *
 * The first fix made the panel `fixed` below `sm` and restored `sm:absolute`
 * above it, so it moved the bug from phone to desktop instead of removing it.
 * `fixed` is now the only positioning mode, at every breakpoint, with the
 * trigger measured in JS to recover the anchoring `absolute` gave for free.
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
 * and therefore names the offending classes in prose; a rule about which
 * CLASSES render must not fire on the sentence describing why they changed.
 * Same approach as labelDiscipline.test.ts.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("§Popover — the panel escapes clipping ancestors at EVERY breakpoint", () => {
  it("never positions the panel with `absolute`, at any breakpoint", () => {
    // THE REGRESSION GUARD. `sm:absolute` is what broke desktop; a bare
    // `absolute` is what broke mobile. Neither may come back — an absolutely
    // positioned panel is clipped by SplitCard's overflow-hidden, which is
    // the "contained in the box" report.
    expect(CODE).not.toMatch(/\babsolute\b/);
  });

  it("positions the panel against the VIEWPORT", () => {
    expect(CODE).toMatch(/"fixed z-50/);
  });

  it("measures the trigger so the panel still follows it", () => {
    // `fixed` costs the automatic anchoring `absolute` provided. If the
    // measurement goes away, every popover pins to the same viewport corner.
    expect(CODE).toMatch(/getBoundingClientRect\(\)/);
    expect(CODE).toMatch(/btnRef/);
  });

  it("keeps the panel on screen horizontally rather than trusting the trigger", () => {
    // A trigger near the right edge with align="left" would otherwise hang off
    // the viewport — the original mobile complaint, which is width-independent
    // and so can recur on a narrow desktop window.
    expect(CODE).toMatch(/Math\.min\(Math\.max\(GAP, preferred\), vw - width - GAP\)/);
  });

  it("flips above the trigger when there is not enough room below", () => {
    expect(CODE).toMatch(/roomBelow/);
    expect(CODE).toMatch(/roomAbove/);
    expect(CODE).toMatch(/bottom: vh - r\.top \+ GAP/);
  });

  it("repositions on scroll from a CONTAINER, not just the window", () => {
    // Capture phase is load-bearing: scroll events on those overflow-x-auto
    // tables do not bubble to window, so a bubble-phase listener would let the
    // panel drift away from its trigger inside exactly the containers that
    // motivated this fix.
    expect(CODE).toMatch(/addEventListener\("scroll", place, true\)/);
    expect(CODE).toMatch(/addEventListener\("resize", place\)/);
    expect(CODE).toMatch(/removeEventListener\("scroll", place, true\)/);
  });

  it("measures before opening, so the first paint is already placed", () => {
    expect(CODE).toMatch(/if \(!open\) place\(\)/);
  });

  it("bounds its height and scrolls internally rather than overflowing", () => {
    expect(CODE).toMatch(/overflow-y-auto/);
    expect(CODE).toMatch(/maxHeight: placement\.maxHeight/);
    // The phone sheet keeps its CSS cap.
    expect(CODE).toMatch(/max-h-\[70vh\]/);
  });

  it("falls back to the viewport sheet below sm", () => {
    expect(CODE).toMatch(/matchMedia\("\(min-width: 640px\)"\)/);
    expect(CODE).toMatch(/inset-x-4 bottom-4/);
  });

  it("never sizes the mobile panel with a fixed width", () => {
    // A `w-80` class was the original bug; the desktop width is now a measured
    // number clamped to the viewport, not a class at all.
    expect(CODE).not.toMatch(/\bw-80\b/);
    expect(CODE).toMatch(/Math\.min\(PANEL_WIDTH, vw - GAP \* 2\)/);
  });

  it("still drives the preferred edge from the align prop", () => {
    expect(CODE).toMatch(/align === "right" \? r\.right - width : r\.left/);
  });

  it("has a tap-to-close backdrop on mobile only", () => {
    expect(CODE).toMatch(/fixed inset-0 z-40 .*sm:hidden/);
    expect(CODE).toMatch(/onClick=\{\(\) => setOpen\(false\)\}/);
  });

  it("keeps the panel a DOM descendant so click-outside still works", () => {
    // `fixed` changes where it PAINTS, not where it lives in the tree. The
    // outside-click test relies on that.
    expect(CODE).toMatch(/ref\.current && !ref\.current\.contains\(e\.target as Node\)/);
  });
});

describe("§Popover — the clipping ancestors that made this necessary still exist", () => {
  /**
   * Anti-vacuity. The fix only matters because these exist; if the overflow
   * containers were removed the guards above would silently stop guarding
   * anything real.
   */
  const CLIPPERS = [
    "components/scorecard/CohortPanels.tsx",
    "components/scorecard/ByMarketTable.tsx",
    "components/scorecard/SourcePerformanceTable.tsx",
    "components/scorecard/LeadCostTable.tsx",
  ];

  it("at least one scorecard table is an overflow container", () => {
    const scrolling = CLIPPERS.filter((f) => /overflow-x-auto/.test(readFileSync(f, "utf8")));
    expect(scrolling.length).toBeGreaterThan(0);
  });

  it("at least one of those containers is DESKTOP-ONLY", () => {
    // This is the specific shape that made the sm-scoped fix wrong: a scroll
    // container that does not exist on a phone and therefore could not be
    // caught by testing on one.
    const desktopOnly = CLIPPERS.filter((f) =>
      /hidden overflow-x-auto[^"]*(?:sm|lg):block/.test(readFileSync(f, "utf8")),
    );
    expect(desktopOnly.length).toBeGreaterThan(0);
  });

  it("the four RevenueCard panels still clip their own content", () => {
    // Sold / Released / Lost / Open backlog — the boxes named in the report.
    // SplitCard needs overflow-hidden for its rounded accent border, so the
    // popover is what has to escape, not the card that has to stop clipping.
    const src = readFileSync("components/scorecard/RevenueCard.tsx", "utf8");
    expect(src).toMatch(/overflow-hidden rounded-lg/);
    for (const title of [
      "Sold this period",
      "Released this period",
      "Lost this period",
      "Open backlog",
    ]) {
      expect(src, `${title} panel is gone — update this guard`).toContain(title);
    }
    expect(src).toMatch(/<InfoPopover info=\{\{ title, \.\.\.info \}\}/);
  });

  it("the cohort table renders an ⓘ, which is the case that was broken first", () => {
    const src = readFileSync("components/scorecard/CohortPanels.tsx", "utf8");
    expect(src).toMatch(/<InfoPopover/);
  });
});

describe("§Popover — no other component hardcodes an off-screen panel width", () => {
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
