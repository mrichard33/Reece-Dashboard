/**
 * The goal is NET. This module is the one place that says so out loud.
 *
 * ══ WHY THIS EXISTS ══
 *
 * Monthly goals are net-sales goals — LP's NSA, not GSA. Every read path in this
 * repo already honours that: the pace hero compares `released_dollars ?? net_sales`,
 * the marketing table's dollar row compares `net_sales`, per-market % to goal
 * compares `released_dollars ?? net_sales`, and the NSLI chain divides the goal by
 * a net-over-issued rate. An audit on 2026-08-10 found no goal compared against a
 * gross actual anywhere.
 *
 * That was the problem. It was true everywhere and recorded nowhere. `gross_sales`,
 * `gross_sold` and `gsli` all exist in the same view models, one identifier away
 * from the net ones, and the goal columns (`monthly_goal_dollars`, `goal_dollars`)
 * carry no basis in their names. A single edit swapping one read to a gross metric
 * would have compiled, passed every test, and overstated attainment by the
 * gross-to-net gap — on January 2026 that gap is the difference between $8.75M net
 * and the larger gross figure, so the error would have been material and silent.
 *
 * The units of the goal and the numerator it is measured against must be the same
 * currency. NSLI is net-over-gross-issued (NSA ÷ NumIssued) and that is correct and
 * unchanged; what has to match is the *goal* against NSLI's *numerator*. Both net.
 *
 * Two guards, matching the two shapes already used in this codebase:
 *   • assertNetGoalBasis  — throws, for write paths (mirrors AllocationError)
 *   • netGoalOrUnmeasured — returns Measured, for read paths that must render
 *                           "—" with a reason rather than take the process down
 */

import { measured, unmeasured, type Measured } from "./tiers/types";

export type GoalBasis = "net" | "gross";

/** The only basis any goal comparison in this repo is written against. */
export const REQUIRED_GOAL_BASIS: GoalBasis = "net";

export class GoalBasisError extends Error {}

/**
 * Every LP metric a goal may legitimately be compared against. All net.
 *
 * Kept as an explicit allowlist rather than a `!== "gross_sold"` check: a new
 * gross metric added upstream should fail this by default, not pass because
 * nobody remembered to add it to a denylist.
 */
export const NET_ACTUAL_METRICS = [
  "net_sales",
  "net_sold",
  "released_dollars",
] as const;
export type NetActualMetric = (typeof NET_ACTUAL_METRICS)[number];

export function isNetActualMetric(metric: string): metric is NetActualMetric {
  return (NET_ACTUAL_METRICS as readonly string[]).includes(metric);
}

/**
 * Write-path guard. Throws rather than storing a goal whose basis this repo's
 * comparisons cannot honour. Follows AllocationError: assert in the pure module,
 * catch and return `{ ok: false }` in the server action, so nothing is written.
 */
export function assertNetGoalBasis(
  basis: string | null | undefined,
  context: string,
): asserts basis is "net" {
  // Null/undefined is net: rows written before goal_basis existed carry no value,
  // and every one of them was entered as net. The column defaults to 'net' for
  // the same reason.
  if (basis == null || basis === REQUIRED_GOAL_BASIS) return;
  throw new GoalBasisError(
    `${context}: goal basis is "${basis}", but every goal comparison in this repo ` +
      `comes from a net actual (${NET_ACTUAL_METRICS.join(" / ")}). Storing a gross ` +
      `goal would overstate attainment by the gross-to-net gap and rescale every ` +
      `NSLI-derived target. Convert the goal to net, or change the comparisons first.`,
  );
}

/**
 * Read-path guard. A goal whose basis does not match is not a number to render
 * confidently and not a reason to crash a page — it is an unknown WITH a reason,
 * the same discipline `Measured` applies to a missing trailing rate.
 */
export function netGoalOrUnmeasured(
  goal: number | null | undefined,
  basis: string | null | undefined,
): Measured<number> {
  if (basis != null && basis !== REQUIRED_GOAL_BASIS) {
    return unmeasured(
      `goal is stored on a "${basis}" basis; every actual it would be compared ` +
        `against is net, so the comparison is not meaningful`,
    );
  }
  if (goal == null || !Number.isFinite(goal)) {
    return unmeasured("no goal set for this market and period");
  }
  return measured(goal);
}
