import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { METRIC_LABELS, METRIC_FORMULAS, labelWithFormula } from "./labels";

// ── §1 — "Close %" is reserved for the Monday definition ───────────────────
//
// `sales ÷ demos` was labelled "Close %" on every surface. The Monday a.m.
// report means `sales ÷ leads ISSUED` by that name — verified: TRI 2 sales / 14
// issued = 14.3%, goal 29 leads × 30% = 9 sales. Two denominators, one label,
// on numbers people plan against.
//
// The metric keeps its computation and its column name. Only the label moved.

describe("§1 — the close-rate vocabulary", () => {
  it("names sales ÷ demos 'Demo → Sale %'", () => {
    expect(METRIC_LABELS.demoToSale).toBe("Demo → Sale %");
    expect(METRIC_FORMULAS.demoToSale).toBe("Sales ÷ demos");
  });

  it("reserves 'Close %' for the sales ÷ leads issued definition", () => {
    expect(METRIC_LABELS.close).toBe("Close %");
    expect(METRIC_FORMULAS.close).toMatch(/leads issued/);
    expect(METRIC_FORMULAS.close).not.toMatch(/÷ demos/);
  });

  it("every rate label can state its own denominator", () => {
    for (const key of Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[]) {
      expect(METRIC_FORMULAS[key]).toBeTruthy();
      expect(METRIC_FORMULAS[key]).toMatch(/÷|per /);
      expect(labelWithFormula(key)).toContain(METRIC_LABELS[key]);
    }
  });
});

// ── The guard ──────────────────────────────────────────────────────────────
//
// `vitest.config.ts` collects `lib/**` only, so no component test can run here
// and no type can express "this string must not appear". A source scan is the
// only way to prove the old label is gone from what actually renders. The same
// guard shape is used in LP-MCP's `scripts/test-*.js`.

const COMPONENT_ROOTS = ["components", "app"];
const SOURCE_EXT = /\.(ts|tsx)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory absent in this checkout — nothing to scan
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name)) out.push(full);
  }
  return out;
}

/** Strip // line comments and block comments — a comment explaining the rename
 *  is not a violation of it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("§1 — no rendered surface still labels sales ÷ demos as 'Close %'", () => {
  it("finds no bare 'Close %' literal in components or app", () => {
    const offenders: string[] = [];
    for (const root of COMPONENT_ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, "utf8"));
        // The literal in any string or JSX text position.
        if (/(["'`])Close %\1/.test(code) || />\s*Close %\s*</.test(code)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("scans a non-trivial number of files (the walk actually works)", () => {
    // Without this, a broken path would make the assertion above vacuously true.
    const total = COMPONENT_ROOTS.reduce((n, r) => n + walk(r).length, 0);
    expect(total).toBeGreaterThan(20);
  });
});
