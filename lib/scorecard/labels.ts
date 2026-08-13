/**
 * Scorecard metric vocabulary — ONE home for the rendered name of each rate.
 *
 * Exists because `sales ÷ demos` was labelled "Close %" on every surface while
 * the Monday a.m. report means something else entirely by that name:
 * `sales ÷ leads ISSUED`. Verified against the report — TRI 2 sales / 14 issued
 * = 14.3%, and its goal reads 29 leads × 30% = 9 sales. Two different
 * denominators, one label, on numbers people plan against.
 *
 * The rename is cosmetic by design: `close_pct` keeps its column name and its
 * computation everywhere: LP-MCP's `scorecard-metrics.js` still emits
 * `rate(sold, demos)`, and nothing here changes that. What changes is that the
 * screen stops calling it something it isn't.
 *
 * RULE: `close` below is RESERVED. Do not attach it to `close_pct`. It belongs
 * to the Monday definition, which nothing computes yet — when that metric is
 * built, both may appear together provided each carries its formula.
 *
 * RULE: `companyDemo` is RESERVED for the same reason, one level up. Amendment
 * A splits the funnel by SCORECARD rather than by metric family: Sales is
 * measured on the appointment-date cohort, the call center on the set-date
 * cohort. "Demo %" and "Company Demo %" are therefore two metrics, not two
 * spellings — 60.8% and 62.2% on the same week — and a sales tile must never
 * wear the call center's name.
 */

export const METRIC_LABELS = {
  /** sales ÷ demos — of the demos we ran, how many sold. */
  demoToSale: "Demo → Sale %",
  /** demos ÷ GROSS issued — the sit rate. */
  demo: "Demo %",
  /** issued ÷ sets. */
  issue: "% Issue",
  /**
   * ⚠️ `goodRate` and `ko` REMOVED — Amendment B3, 2026-08-13.
   *
   * Neither was in the v4 or Amendment A metric set, and each duplicated a
   * contracted Report 137 metric with one term dropped:
   *
   *   Good Rate % `(Sold − cancelled) ÷ sold $`  =  Net Retention %
   *     `(GSA − GSACancelled − GSACD) ÷ GSA` without Financing Denied.
   *   KO % `Cancelled ÷ sold`                    =  the cancellation half of
   *     Permanent Loss % `(GSACancelled + GSACD) ÷ GSA`.
   *
   * Both contracted metrics are correctly sourced from 137 and strictly more
   * complete, so removal loses nothing measurable. Good Rate % was also not
   * reading 137 at all — 95.5% for August against 137's gross-after-cancels of
   * 90.0%, with four markets storing exactly 100.0%.
   *
   * These names are NOT reserved the way `close` and `companyDemo` are. They
   * are retired: if either metric is wanted again it needs a source, a cohort
   * and a contract entry first, not a label.
   */
  /**
   * Net Sales ÷ Issued APPOINTMENTS — the pacing driver.
   *
   * ⚠️ NEVER "NSLI", "Net $ per Issued Lead" or "Gross $ per Issued Lead". The
   * denominator is `NumIssued`, which is appointment/attempt grain, not lead
   * grain: 78,557 Lead Disposition rows sit over 71,040 distinct leads, one
   * lead carries up to 11 of them, and `num_superseded` reaches 10. Calling the
   * denominator "leads" invites dividing it into a lead count, which is the
   * grain bridge §13 blocks until it is proven.
   */
  netPerIssuedAppointment: "Net Sales $ per Issued Appointment",
  /**
   * RESERVED — sales ÷ leads issued (Monday a.m. report). NOT YET COMPUTED.
   * Attaching this to `close_pct` is the exact defect this module exists to
   * prevent; `labels.test.ts` fails the build if the literal reappears in a
   * component.
   */
  close: "Close %",
  /**
   * RESERVED — the CALL CENTER's demo rate, on a SET-date cohort.
   *
   * ⚠️ NOT a synonym for `demo` above, and the difference is not stylistic.
   * Under Amendment A the two scorecards are measured on different cohorts:
   * Sales on the appointment date, the call center on the set date. For
   * 8/2–8/8 that is 60.8% here (report 137, 271 ÷ 446) and 62.2% there
   * (Appointment Statistics, 260 ÷ 418). Same week, two valid answers.
   *
   * The sales scorecard renders "Demo %". Putting "Company Demo %" on a sales
   * tile would attach the call center's name to the sales number and recreate
   * the one-name-two-numbers collision the amendment exists to prevent —
   * exactly as `close` above did for `sales ÷ demos`.
   *
   * NOT YET COMPUTED. The call-center scorecard is HELD pending A3: Appointment
   * Statistics has not been verified as set-date filtered, and a set-date
   * cohort may not be approximated from an appointment-date source.
   */
  companyDemo: "Company Demo %",
} as const;

/**
 * Denominator, spelled out. Every displayed percentage must be able to answer
 * "percent of what?" without the reader opening the code.
 */
export const METRIC_FORMULAS: Record<keyof typeof METRIC_LABELS, string> = {
  demoToSale: "Sales ÷ demos",
  demo: "Demos ÷ gross issued",
  companyDemo:
    "Demos ÷ issued, on the SET-date cohort (call-center scorecard — not yet computed, see A3)",
  issue: "Issued ÷ sets",
  netPerIssuedAppointment: "Net Sales $ ÷ issued appointments (report 137, both sides)",
  close: "Sales ÷ leads issued (Monday report definition — not yet computed)",
};

/** Label plus its denominator, for tooltips and glossary rows. */
export function labelWithFormula(key: keyof typeof METRIC_LABELS): string {
  return `${METRIC_LABELS[key]} — ${METRIC_FORMULAS[key]}`;
}
