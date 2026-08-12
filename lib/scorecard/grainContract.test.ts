import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  GRAIN_CONTRACT,
  assertGrainContract,
  publishedMetrics,
  type GrainRow,
} from "./grainContract";
import { METRIC_LABELS } from "./labels";

/**
 * §12 / A6 — the grain contract is enforced, not documented.
 *
 * CI fails on an incomplete row. That is the whole mechanism: a reviewer adding
 * a metric answers the five questions or the build stays red.
 */

describe("§12 — every published metric registers a complete grain row", () => {
  it("the shipped contract has no violations", () => {
    expect(assertGrainContract()).toEqual([]);
  });

  it("catches a missing source", () => {
    // Anti-vacuity: the rule above passes trivially if the checker checks
    // nothing. Feed it a row that is wrong in each way and prove it complains.
    const bad: GrainRow = {
      metric: "Made Up %",
      scorecard: "sales",
      numerator: "appointment",
      denominator: "appointment",
      aggregation: ["company"],
      source: "   ",
      cohortDate: "appointment",
    };
    expect(assertGrainContract([bad])).toContainEqual({
      metric: "Made Up %",
      problem: "no source report named",
    });
  });

  it("catches a missing aggregation grain — §11 would be uncheckable", () => {
    const bad: GrainRow = {
      metric: "Made Up %",
      scorecard: "sales",
      numerator: "appointment",
      denominator: "appointment",
      aggregation: [],
      source: "Report 137",
      cohortDate: "appointment",
    };
    expect(assertGrainContract([bad])).toContainEqual({
      metric: "Made Up %",
      problem: "no aggregation grain — §11 cannot be checked",
    });
  });

  it("catches a bare count published as a metric", () => {
    const bad: GrainRow = {
      metric: "Issued",
      scorecard: "sales",
      numerator: "appointment",
      denominator: null,
      aggregation: ["company"],
      source: "Report 137",
      cohortDate: "appointment",
    };
    expect(assertGrainContract([bad])).toContainEqual({
      metric: "Issued",
      problem: "appointment with no denominator is a bare count, not a metric",
    });
  });

  it("catches a held metric that does not say why", () => {
    const bad: GrainRow = {
      metric: "LP Sit %",
      scorecard: "call_center",
      numerator: "appointment",
      denominator: "appointment",
      aggregation: ["setter"],
      source: "TBD",
      cohortDate: "set",
      held: "",
    };
    expect(assertGrainContract([bad])).toContainEqual({
      metric: "LP Sit %",
      problem: "held with no stated reason",
    });
  });

  it("catches the same metric registered twice on one scorecard", () => {
    const row = GRAIN_CONTRACT[0]!;
    expect(assertGrainContract([row, row])).toContainEqual({
      metric: row.metric,
      problem: `registered twice on the ${row.scorecard} scorecard`,
    });
  });
});

describe("A6 — no KPI mixes cohort dates", () => {
  it("every sales metric is on the appointment cohort", () => {
    for (const r of GRAIN_CONTRACT.filter((x) => x.scorecard === "sales")) {
      expect(r.cohortDate).toBe("appointment");
    }
  });

  it("every call-centre metric is on the set cohort", () => {
    for (const r of GRAIN_CONTRACT.filter((x) => x.scorecard === "call_center")) {
      expect(r.cohortDate).toBe("set");
    }
  });

  it("a metric name never appears on both scorecards with different cohorts", () => {
    // The structural version of the "Company Demo %" rule. If one NAME ever
    // carried two cohort dates, a reader comparing the two pages would be
    // comparing different quantities under one heading.
    const byName = new Map<string, Set<string>>();
    for (const r of GRAIN_CONTRACT) {
      const s = byName.get(r.metric) ?? new Set<string>();
      s.add(r.cohortDate);
      byName.set(r.metric, s);
    }
    for (const [metric, dates] of byName) {
      expect(dates.size, `${metric} is filed under ${[...dates].join(" and ")}`).toBe(1);
    }
  });

  it("Demo % and Company Demo % are DIFFERENT registered metrics", () => {
    const demo = GRAIN_CONTRACT.find((r) => r.metric === METRIC_LABELS.demo)!;
    const company = GRAIN_CONTRACT.find((r) => r.metric === METRIC_LABELS.companyDemo)!;
    expect(demo.scorecard).toBe("sales");
    expect(demo.cohortDate).toBe("appointment");
    expect(company.scorecard).toBe("call_center");
    expect(company.cohortDate).toBe("set");
    // …and only one of them ships.
    expect(demo.held).toBeUndefined();
    expect(company.held).toBeTruthy();
  });
});

describe("A2 / A3 — what ships and what is held", () => {
  it("the whole sales funnel is Report 137, and it ships", () => {
    const sales = publishedMetrics().filter((r) => r.scorecard === "sales");
    expect(sales.length).toBeGreaterThanOrEqual(6);
    for (const r of sales) expect(r.source).toMatch(/Report 137/);
  });

  it("market-grain Demo % is published — §5's blocker is dissolved", () => {
    const demo = GRAIN_CONTRACT.find((r) => r.metric === METRIC_LABELS.demo)!;
    expect(demo.held).toBeUndefined();
    expect(demo.aggregation).toContain("market");
  });

  it("Set and Set → Issued % are NOT on the sales scorecard", () => {
    // 137 has no NumSet column, and set-count is a call-centre measure (A1).
    const sales = GRAIN_CONTRACT.filter((r) => r.scorecard === "sales");
    expect(sales.find((r) => /^Set\b|Set → Issued/.test(r.metric))).toBeUndefined();
    const cc = GRAIN_CONTRACT.find((r) => r.metric === "Set → Issued %")!;
    expect(cc.scorecard).toBe("call_center");
  });

  it("every call-centre metric is held, and each says why", () => {
    const cc = GRAIN_CONTRACT.filter((r) => r.scorecard === "call_center");
    expect(cc.length).toBeGreaterThan(0);
    for (const r of cc) {
      expect(r.held, `${r.metric} must be held pending A3`).toBeTruthy();
      expect(r.held).toMatch(/A3/);
    }
    expect(publishedMetrics().filter((r) => r.scorecard === "call_center")).toEqual([]);
  });

  it("the pacing chain takes BOTH sides from 137 (A7)", () => {
    const r = GRAIN_CONTRACT.find(
      (x) => x.metric === METRIC_LABELS.netPerIssuedAppointment,
    )!;
    expect(r.source).toMatch(/both sides/i);
    expect(r.denominator).toBe("appointment");
    expect(r.cohortDate).toBe("appointment");
  });
});

/**
 * The registry is only worth having if it describes what actually renders.
 * This is the join between the two.
 */
describe("§12 — the registry matches the rendered vocabulary", () => {
  const ROOTS = ["components", "app"];
  const walk = (dir: string, out: string[] = []): string[] => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const name of entries) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  };

  it("every metric label in the registry is one the label module knows", () => {
    // Catches a registry row drifting away from the vocabulary it is supposed
    // to be registering — a row for "Close Rate %" would pass every structural
    // check above and describe nothing that renders.
    const known = new Set<string>(Object.values(METRIC_LABELS));
    const funnelRows = GRAIN_CONTRACT.filter(
      (r) => r.numerator !== "sales_dollars" || r.denominator === "appointment",
    );
    const strays = funnelRows
      .map((r) => r.metric)
      .filter((m) => !known.has(m) && !/^(Set → Issued %|No Home %|One-Leg %|LP Sit %)$/.test(m));
    expect(strays).toEqual([]);
  });

  it("no held metric's name renders anywhere", () => {
    // The hold has to be real. A held metric whose label is already on a page
    // is shipping under a different code path.
    const held = GRAIN_CONTRACT.filter((r) => r.held !== undefined).map((r) => r.metric);
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const code = strip(readFileSync(file, "utf8"));
        for (const metric of held) {
          for (const m of code.matchAll(new RegExp(metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))) {
            const before = code.slice(Math.max(0, m.index! - 60), m.index!);
            // Same carve-out as labels.test.ts: a name may be mentioned in
            // order to disown it.
            if (!/\b(NOT|NEVER|never|Formerly|formerly|no longer|instead of|rather than)\b[^.]{0,60}$/.test(before)) {
              offenders.push(`${file}: ${metric}`);
            }
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
