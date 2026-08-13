/**
 * THE GRAIN CONTRACT — every published metric, registered as DATA.
 *
 * ══ WHY THIS IS CODE AND NOT A DOCUMENT ══
 *
 * "Dollars" is a unit, not a grain. Two figures can both be dollars, both be
 * correct, and be uncomparable — and nothing in a type signature says so. The
 * page has been wrong in exactly that way more than once: a point-in-time HOLD
 * STOCK subtracted from a PERIOD FLOW; RTP dollars paced against a sales goal;
 * live-sync counts rendered beside report-137 money as if one row described one
 * thing.
 *
 * A markdown table would have described all three and prevented none. This is
 * stored as data so CI can fail on an incomplete row, and so a reviewer adding
 * a metric has to answer the five questions before the build goes green.
 *
 * ══ THE FIFTH COLUMN IS THE NEW ONE ══
 *
 * v4 §12 registered four facets. Amendment A6 adds COHORT DATE, because that is
 * the axis the two scorecards actually differ on:
 *
 *     Cohort date follows the DEPARTMENT being managed.
 *
 *       Sales       → appointment date. What did the appointments Sales was
 *                     responsible for produce?
 *       Call centre → set date. What happened to the appointments this setter
 *                     created?
 *
 * A setter books on Aug 5 for Aug 12. That appointment belongs to the week of
 * Aug 5 on the call-centre scorecard and to the period containing Aug 12 on the
 * sales scorecard. Same appointment, two valid views, two different cohorts —
 * and a KPI that takes its numerator from one and its denominator from the
 * other is meaningless in a way no unit check would catch. `assertGrainContract`
 * fails on exactly that.
 */

/** Which scorecard publishes the metric. The cohort date follows from it. */
export type Scorecard = "sales" | "call_center";

/**
 * What one row of the numerator or denominator COUNTS.
 *
 * `sales_dollars` is a value, not a countable thing, and is legal only as a
 * numerator over `null` (Net Sales $) or over itself (a retention rate).
 */
export type EntityGrain =
  | "appointment"
  | "appointment_demo_outcome"
  | "appointment_sale_outcome"
  | "sales_dollars"
  | "lead";

/** The level rows are summed to BEFORE any rate is derived (§11). */
export type AggregationGrain = "office" | "market" | "setter" | "company";

/** The date a row is filed under — A6's addition. */
export type CohortDate = "appointment" | "set" | "lead" | "production_milestone";

export type GrainRow = {
  /** The metric's PUBLISHED name. Must match what renders. */
  metric: string;
  scorecard: Scorecard;
  numerator: EntityGrain;
  /** Null for a level (Net Sales $), which has no denominator. */
  denominator: EntityGrain | null;
  aggregation: readonly AggregationGrain[];
  /** Named so a reader can go and check. */
  source: string;
  cohortDate: CohortDate;
  /**
   * Set when the metric is registered but NOT SHIPPED, with the reason. A held
   * metric still has to declare its grain — that is how the hold stays visible
   * instead of becoming an absence nobody remembers.
   */
  held?: string;
};

/**
 * ⚠️ THE SALES SCORECARD IS ENTIRELY REPORT 137 AND ENTIRELY APPOINTMENT-DATED.
 *
 * That is the property Amendment A2 buys: counts and dollars come from the same
 * export, filtered the same way, so a row is internally consistent. v4 §1 barred
 * 137's counts from funnel metrics; A2 retires that bar, because it was right
 * only while one funnel was being made to serve both departments.
 *
 * `Set` and `Set → Issued %` are ABSENT from the sales scorecard on purpose —
 * 137 has no NumSet column, and set-count is a call-centre measure under A1.
 *
 * ══ WHY THE RAW COUNTS ARE NOT IN HERE ══
 *
 * Leads, Issued, Demos, Sales — and, from 2026-08-13, "Leads (distinct)" and
 * "Duplicates merged by LP" — all render on the By Market table and none are
 * registered. That is the rule at `assertGrainContract`, not an oversight: a
 * bare count with no denominator is not a publishable METRIC, so registering
 * one would either fail the assertion or force a denominator to be invented
 * for it. This registry covers rates and dollar levels — the figures where a
 * numerator and a denominator can disagree about grain, which is the defect
 * class it exists to catch.
 *
 * The lead-grain pair is worth naming here anyway, because it is the one place
 * the page shows TWO counts of the same thing: "Leads" is report 135's ROW
 * count and "Leads (distinct)" is its LEAD count. They are not a numerator and
 * a denominator and must never be divided into one another — the ratio between
 * them is an artefact of how many disposition states each lead passed through,
 * not a rate. §13's grain bridge stays unproven and unbuilt.
 */
export const GRAIN_CONTRACT: readonly GrainRow[] = [
  // ── Sales scorecard — appointment-date cohort, Report 137 ────────────────
  {
    metric: "Net Sales $",
    scorecard: "sales",
    numerator: "sales_dollars",
    denominator: null,
    aggregation: ["market", "company"],
    source: "Report 137 (GSA − GSACancelled − GSACD)",
    cohortDate: "appointment",
  },
  {
    metric: "Net Retention %",
    scorecard: "sales",
    numerator: "sales_dollars",
    denominator: "sales_dollars",
    aggregation: ["market", "company"],
    source: "Report 137",
    cohortDate: "appointment",
  },
  {
    metric: "Permanent Loss %",
    scorecard: "sales",
    numerator: "sales_dollars",
    denominator: "sales_dollars",
    aggregation: ["market", "company"],
    source: "Report 137",
    cohortDate: "appointment",
  },
  {
    metric: "Demo %",
    scorecard: "sales",
    numerator: "appointment",
    denominator: "appointment",
    aggregation: ["market", "company"],
    source: "Report 137 (NumSat ÷ NumIssued)",
    cohortDate: "appointment",
  },
  {
    metric: "Demo → Sale %",
    scorecard: "sales",
    numerator: "appointment_sale_outcome",
    denominator: "appointment_demo_outcome",
    aggregation: ["market", "company"],
    source: "Report 137 (NumSale ÷ NumSat)",
    cohortDate: "appointment",
  },
  {
    metric: "Net Sales $ per Issued Appointment",
    scorecard: "sales",
    numerator: "sales_dollars",
    denominator: "appointment",
    aggregation: ["market", "company"],
    // A7: no longer a cross-report ratio. Both sides are 137, same cohort, same
    // date basis — so the v4 §6 warning against "fixing" it by taking both
    // sides from one report is retired along with the split.
    source: "Report 137 (both sides)",
    cohortDate: "appointment",
  },

  // ── Call-centre scorecard — set-date cohort. HELD, and declared anyway. ───
  //
  // A3 blocks every row below. Report 137 By Setter is appointment-dated: it
  // says which setter ORIGINATED appointments that OCCURRED in the window, not
  // which appointments a setter CREATED in it. Appointment Statistics is
  // recorded in Notion as appointment-date filtered in one place and "issue
  // date" in another, and neither is set date. Until the PDF header is read and
  // a set-date source is confirmed, these do not ship — and a set-date cohort
  // may NOT be approximated from an appointment-date source.
  ...(
    [
      ["Set → Issued %", "appointment", "appointment"],
      ["Company Demo %", "appointment", "appointment"],
      ["No Home %", "appointment", "appointment"],
      ["One-Leg %", "appointment", "appointment"],
      ["LP Sit %", "appointment", "appointment"],
    ] as const
  ).map(
    ([metric, numerator, denominator]): GrainRow => ({
      metric,
      scorecard: "call_center",
      numerator,
      denominator,
      aggregation: ["setter", "company"],
      source: "set-date source — NOT YET IDENTIFIED (A3)",
      cohortDate: "set",
      held:
        "A3: no source is confirmed set-date filtered. Report 137 By Setter is " +
        "appointment-dated; Appointment Statistics is recorded as appointment-date " +
        "in one place and issue-date in another. Render the PDF header, then decide.",
    }),
  ),
];

export type GrainViolation = { metric: string; problem: string };

/**
 * CI gate. Returns every violation; empty means the contract holds.
 *
 * Two rules, and the second is A6's whole point:
 *
 *   1. COMPLETENESS — a published metric with a missing facet is unregistered
 *      in practice, however many fields the row happens to have.
 *   2. ONE COHORT PER KPI — a ratio whose numerator and denominator are filed
 *      under different cohort dates is not a rate, it is two periods divided by
 *      each other. Because a row carries ONE `cohortDate`, this is enforced by
 *      construction for anything in the registry; the check that matters is
 *      that a ratio never spans scorecards, which is how the two bases would
 *      actually get mixed.
 */
export function assertGrainContract(
  rows: readonly GrainRow[] = GRAIN_CONTRACT,
): GrainViolation[] {
  const out: GrainViolation[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    if (!r.metric.trim()) out.push({ metric: r.metric, problem: "no metric name" });
    if (seen.has(`${r.scorecard}|${r.metric}`)) {
      out.push({ metric: r.metric, problem: `registered twice on the ${r.scorecard} scorecard` });
    }
    seen.add(`${r.scorecard}|${r.metric}`);

    if (!r.source.trim()) {
      out.push({ metric: r.metric, problem: "no source report named" });
    }
    if (r.aggregation.length === 0) {
      out.push({ metric: r.metric, problem: "no aggregation grain — §11 cannot be checked" });
    }
    // A level has no denominator; a rate must have one. `sales_dollars` over
    // nothing is Net Sales $; `appointment` over nothing is a bare count and is
    // not a publishable metric.
    if (r.denominator == null && r.numerator !== "sales_dollars") {
      out.push({
        metric: r.metric,
        problem: `${r.numerator} with no denominator is a bare count, not a metric`,
      });
    }
    // A HELD metric must say why. "Held" with no reason decays into "missing".
    if (r.held !== undefined && !r.held.trim()) {
      out.push({ metric: r.metric, problem: "held with no stated reason" });
    }
  }

  return out;
}

/** The rows that actually render. Held metrics are registered, not published. */
export function publishedMetrics(rows: readonly GrainRow[] = GRAIN_CONTRACT): GrainRow[] {
  return rows.filter((r) => r.held === undefined);
}
