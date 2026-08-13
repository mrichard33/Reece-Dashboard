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

  it("Good Rate % and KO % are RETIRED, not merely unrendered (B3)", () => {
    // This test used to assert that KO % named its cohort, because ③ "Lost this
    // period" counts the same event on report 133's contract-date cohort and
    // disagreed — 14 lost jobs against a ko_count of 12. Amendment B3 removes
    // the metric instead: it is the cancellation half of Permanent Loss %, and
    // Good Rate % is Net Retention % with Financing Denied dropped. Both
    // contracted 137 metrics are strictly more complete.
    //
    // Asserting the ABSENCE rather than deleting the test: an unrendered label
    // left in the vocabulary is how a retired metric comes back.
    const keys = Object.keys(METRIC_LABELS);
    expect(keys).not.toContain("goodRate");
    expect(keys).not.toContain("ko");
    expect(Object.values(METRIC_LABELS)).not.toContain("Good Rate %");
    expect(Object.values(METRIC_LABELS)).not.toContain("KO %");
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

/**
 * §16 / A8 — the vocabulary guards.
 *
 * Every rule here exists because two different quantities were sharing one
 * name on a screen people plan against. The scanner reads rendered source with
 * comments stripped, so prose explaining a rename never trips the rule it
 * explains.
 *
 * ⚠️ RETIRED NAMES MAY BE MENTIONED, BUT ONLY TO DISOWN THEM. A tooltip reading
 * `NOT "Company Demo %"` and a glossary entry reading `Formerly "NSLI"` are the
 * two places a reader can find out that a rename happened — banning them
 * outright would delete the explanation along with the defect. So a hit is
 * exempt when it is NEGATED or marked HISTORICAL within the preceding 60
 * characters, and a violation otherwise.
 */
const DISOWNED = /\b(NOT|NEVER|never|Formerly|formerly|no longer|instead of|rather than|used to)\b[^.]{0,60}$/;

/** Is this hit a mention that disowns the name, rather than a use of it? */
function disowned(code: string, index: number): boolean {
  return DISOWNED.test(code.slice(Math.max(0, index - 60), index));
}
describe("§16 — the sales scorecard does not wear the call center's names", () => {
  it("no component renders 'Company Demo %'", () => {
    // Amendment A splits the funnel by SCORECARD, not by metric family. Sales
    // is measured on the APPOINTMENT-date cohort and renders "Demo %"; the call
    // center is measured on the SET-date cohort and owns "Company Demo %". On
    // 8/2–8/8 those are 60.8% and 62.2% — same week, two valid answers, and
    // putting the call center's NAME on the sales NUMBER is precisely the
    // collision the amendment exists to prevent.
    //
    // When the call-center scorecard ships (held pending A3's date-basis
    // verification), this rule narrows to "not on a sales surface" rather than
    // disappearing.
    const offenders: string[] = [];
    for (const root of COMPONENT_ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, "utf8"));
        for (const m of code.matchAll(/Company Demo %/g)) {
          if (!disowned(code, m.index!)) offenders.push(`${file}:${m.index}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the reserved label exists in the registry, so the rename has one home", () => {
    // Anti-vacuity: the rule above passes trivially if nobody ever names the
    // metric. The registry has to carry it, reserved and unattached.
    expect(METRIC_LABELS.companyDemo).toBe("Company Demo %");
    expect(METRIC_LABELS.demo).toBe("Demo %");
    expect(METRIC_LABELS.demo).not.toBe(METRIC_LABELS.companyDemo);
  });
});

describe("§16 — the efficiency driver is per issued APPOINTMENT, never per lead", () => {
  it("no component renders 'per Issued Lead' or a bare 'NSLI'", () => {
    // The denominator is NumIssued — appointment/attempt grain. Calling it
    // "leads" invites dividing it into a lead count, which is the §13 grain
    // bridge nothing has proven.
    const offenders: string[] = [];
    for (const root of COMPONENT_ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, "utf8"));
        for (const m of code.matchAll(/per Issued Lead/gi)) {
          if (!disowned(code, m.index!)) offenders.push(`${file} (per Issued Lead)`);
        }
        // `NSLI` in a rendered position. Field names like `trailingNSLI` and
        // `planningNsli` are addresses, not labels, and are allowed.
        for (const m of code.matchAll(/(["'`>])\s*NSLI\b/g)) {
          if (!disowned(code, m.index!)) offenders.push(`${file} (bare NSLI)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the registry carries the full name and its formula", () => {
    expect(METRIC_LABELS.netPerIssuedAppointment).toBe("Net Sales $ per Issued Appointment");
    expect(METRIC_FORMULAS.netPerIssuedAppointment).toMatch(/issued appointments/i);
    expect(METRIC_LABELS.netPerIssuedAppointment).not.toMatch(/lead/i);
  });
});

describe("§16 — NSA is never bare, and never called 'Net'", () => {
  it("every rendered NSA mention names its report", () => {
    // Two different quantities are called NSA. Report 137 NSA removes live
    // Working and Hold; Appointment Statistics NSA does not, and for 8/2–8/8
    // equalled Reece Net Sales exactly ($1,511,514, difference $0). Neither is
    // ever the source of record for Net Sales, and an unqualified "NSA" cannot
    // say which one it means.
    const offenders: string[] = [];
    for (const root of COMPONENT_ROOTS) {
      for (const file of walk(root)) {
        const code = stripComments(readFileSync(file, "utf8"));
        for (const m of code.matchAll(/[^\w](NSA)\b/g)) {
          const before = code.slice(Math.max(0, m.index! - 60), m.index!);
          // Qualified by a report name, or by the "Net (NSA)" column label
          // whose own tooltip names report 137.
          const qualified =
            /report\s*137|Appointment Statistics/i.test(before) || disowned(code, m.index!);
          if (!qualified) offenders.push(`${file}: …${before.slice(-40)}NSA`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
