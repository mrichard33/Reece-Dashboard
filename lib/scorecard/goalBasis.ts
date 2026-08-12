/**
 * The goal is NET SALES. This module is the one place that says so out loud.
 *
 * ══ THE DEFINITION ══
 *
 *     Net Sales = Gross Written − Cancellations − Financing Denied
 *
 * Ruled 2026-08-12. This is the goal-bearing basis, and by the governing
 * principle below it is also the basis of the actual, the pace, and the
 * efficiency denominator. In LP's report 137 columns that is
 * `gsa_cents − cancelled_cents − cd_cents` ("CD" is credit decline, i.e.
 * financing denied).
 *
 * ══ WHY THIS BASIS AND NOT ONE OF THE OTHER FOUR ══
 *
 * Five different dollar figures describe the same month's selling, and they are
 * genuinely different numbers. Fort Myers, August 2026:
 *
 *     Gross Written          $873,208   everything written
 *     Gross after cancels    $844,765   less cancellations only
 *     NET SALES              $821,484   less cancellations AND financing denied
 *     Net (NSA)              $343,676   less working and hold as well
 *     Released (RTP)              n/a   a different cohort entirely
 *
 * Net Sales excludes the two TERMINAL losses — the business that is gone — and
 * counts working and hold as still in play. That makes it measurable NOW:
 * cancellations and financing denials land within days, while working and hold
 * take months to drain. And it converges on NSA as a cohort settles; measured
 * 2026-08-11, NSA is 100.1%–101.6% of Net Sales on the settled Jan–Apr cohorts.
 * It is NSA without the maturation lag — a number a manager can be held to in
 * the month they earned it.
 *
 * ══ WHY THIS MODULE EXISTS AT ALL ══
 *
 * An audit on 2026-08-10 found no goal compared against a gross actual
 * anywhere. That was the problem: it was true everywhere and recorded nowhere.
 * `gross_sales`, `gross_sold` and `gsli` all live in the same view models, one
 * identifier away from the right ones, and the goal columns carry no basis in
 * their names. A single edit swapping one read to a gross metric would compile,
 * pass every test, and overstate attainment by the gross-to-net gap — on Fort
 * Myers that is $873,208 against $821,484 for one market in one month.
 *
 * ══ THE GOVERNING PRINCIPLE ══
 *
 * The goal, the actual, the pace, and the efficiency denominator must all use
 * the same sales-dollar basis. If a step seems to require mixing bases, stop
 * and report rather than proceeding. This is why `released_dollars` (RTP) is
 * now REFUSED below although it was previously allowed: RTP is dated by
 * production milestone, so a contract sold in April lands in August. It answers
 * a production question and cannot be paced against a sales goal.
 *
 * A future change of basis is a METRIC-CONTRACT DECISION, not a number swap.
 * Do not change the goal figure while leaving the actuals and the pacing
 * denominator on the old basis — that reintroduces exactly the mixing this
 * module exists to prevent.
 *
 * Two guards, matching the two shapes already used in this codebase:
 *   • assertNetGoalBasis  — throws, for write paths (mirrors AllocationError)
 *   • netGoalOrUnmeasured — returns Measured, for read paths that must render
 *                           "—" with a reason rather than take the process down
 */

import { measured, unmeasured, type Measured } from "./tiers/types";

/**
 * The stored basis vocabulary. Unchanged, and deliberately so: every goal row
 * is already stamped 'net', and 'net' now carries the Net Sales definition at
 * the top of this file. Redefining the word beat migrating 96 rows to a new
 * enum value that would have meant the same thing.
 */
export type GoalBasis = "net" | "gross";

/** The only basis any goal comparison in this repo is written against. */
export const REQUIRED_GOAL_BASIS: GoalBasis = "net";

/** Net Sales, spelled out once for UI copy and error messages. */
export const NET_SALES_DEFINITION =
  "Gross Written − Cancellations − Financing Denied";

export class GoalBasisError extends Error {}

/**
 * Every LP metric a goal may legitimately be compared against.
 *
 * Kept as an explicit allowlist rather than a denylist: a new metric added
 * upstream should fail this by default, not pass because nobody remembered to
 * exclude it.
 */
export const NET_ACTUAL_METRICS = ["net_sales_cents", "net_sales"] as const;
export type NetActualMetric = (typeof NET_ACTUAL_METRICS)[number];

export function isNetActualMetric(metric: string): metric is NetActualMetric {
  return (NET_ACTUAL_METRICS as readonly string[]).includes(metric);
}

/**
 * Metrics that are dollars-of-selling but are NOT the goal basis, each with the
 * reason. A wrong pick is easy to make and the failure is silent, so the error
 * says which basis was reached for and why it does not belong.
 *
 * `net_sold` is the trap worth naming: it is LP's NSA, it has "net" in the
 * name, and it is 58% smaller than Net Sales on a young cohort because working
 * and hold have not drained yet.
 */
export const NON_GOAL_METRICS: Readonly<Record<string, string>> = {
  released_dollars:
    "RTP — released to production, dated by production milestone. A contract " +
    "sold in April lands in August, so it cannot be paced against a sales goal.",
  net_sales_rtp:
    "RTP net from report 134. Same milestone-dating problem as released_dollars.",
  net_sold:
    "NSA — LP's fully-settled net, which additionally subtracts working and " +
    "hold. It lags by months: on the July 2026 cohort NSA was 50.9% of gross " +
    "while Net Sales was 76.3%. Use it for cohort QUALITY, not for the goal.",
  nsa_cents: "NSA. See net_sold.",
  gross_sold: "Gross Written — before cancellations and financing denials.",
  gross_sales: "Gross Written. See gross_sold.",
  gsa_cents: "Gross Written. See gross_sold.",
  gross_after_cancels:
    "Gross less cancellations ONLY. It omits financing denials, so it sits " +
    "between Gross Written and Net Sales and is never labelled Net.",
};

/**
 * Write-path guard. Throws rather than storing a goal whose basis this repo's
 * comparisons cannot honour. Follows AllocationError: assert in the pure
 * module, catch and return `{ ok: false }` in the server action, so nothing is
 * written.
 */
export function assertNetGoalBasis(
  basis: string | null | undefined,
  context: string,
): asserts basis is "net" {
  // Null/undefined is net: rows written before goal_basis existed carry no
  // value, and every one of them was entered as net. The column defaults to
  // 'net' for the same reason.
  if (basis == null || basis === REQUIRED_GOAL_BASIS) return;
  throw new GoalBasisError(
    `${context}: goal basis is "${basis}", but every goal comparison in this repo ` +
      `comes from Net Sales (${NET_SALES_DEFINITION}). Storing a goal on another ` +
      `basis would overstate or understate attainment by the difference between ` +
      `them and rescale every efficiency-derived target. Convert the goal to Net ` +
      `Sales, or change the comparisons first — that is a metric-contract decision, ` +
      `not a number swap.`,
  );
}

/**
 * Read-path guard for the metric side of the comparison. A goal measured
 * against the wrong dollar basis is not a number to render confidently.
 */
export function assertNetActualMetric(metric: string, context: string): void {
  if (isNetActualMetric(metric)) return;
  const why = NON_GOAL_METRICS[metric];
  throw new GoalBasisError(
    `${context}: "${metric}" is not the goal basis. ` +
      (why ? `${metric} is ${why} ` : "") +
      `The goal is Net Sales (${NET_SALES_DEFINITION}); compare against ` +
      `${NET_ACTUAL_METRICS.join(" or ")}.`,
  );
}

/**
 * Read-path guard. A goal whose basis does not match is not a number to render
 * confidently and not a reason to crash a page — it is an unknown WITH a
 * reason, the same discipline `Measured` applies to a missing trailing rate.
 */
export function netGoalOrUnmeasured(
  goal: number | null | undefined,
  basis: string | null | undefined,
): Measured<number> {
  if (basis != null && basis !== REQUIRED_GOAL_BASIS) {
    return unmeasured(
      `goal is stored on a "${basis}" basis; every actual it would be compared ` +
        `against is Net Sales (${NET_SALES_DEFINITION}), so the comparison is ` +
        `not meaningful`,
    );
  }
  if (goal == null || !Number.isFinite(goal)) {
    return unmeasured("no goal set for this market and period");
  }
  return measured(goal);
}
