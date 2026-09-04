/**
 * Scorecard meeting view (2026-09-04).
 *
 * The /scorecard tab is used live in weekly sales-manager meetings. Anything
 * that does not help a manager answer "where are we, what's the goal, how many
 * leads do I need" is moved to /scorecard/detail rather than deleted — the
 * queries, components and data are all untouched.
 */
export const MEETING_VIEW = {
  /** ② Expected Economic Outcome — modeled forecast. Detail page only. */
  showExpectedOutcome: false,
  /** ③ Cohort Quality — month-by-month maturation table. Detail page only. */
  showCohortQuality: false,
  /** ⑤ By Market — full market grid. Detail page only. */
  showByMarket: false,
  /**
   * The PROVISIONAL banner. `reconciled` is a flag on
   * lp_market_scorecard_daily that nothing sets to true any more — the Net
   * Report reconciliation path was retired when Net Sales moved to report 137
   * (ruled 2026-08-13). It therefore fired on every market, every period,
   * permanently, which is noise rather than a warning. The source + coverage
   * date now render as a plain provenance line instead.
   */
  showProvisionalBanner: false,
} as const;
