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
 */

export const METRIC_LABELS = {
  /** sales ÷ demos — of the demos we ran, how many sold. */
  demoToSale: "Demo → Sale %",
  /** demos ÷ GROSS issued — the sit rate. */
  demo: "Demo %",
  /** issued ÷ sets. */
  issue: "% Issue",
  /** (sold − cancelled) ÷ sold $. */
  goodRate: "Good Rate %",
  /** jobs cancelled after the sale; lower is better. */
  ko: "KO %",
  /**
   * RESERVED — sales ÷ leads issued (Monday a.m. report). NOT YET COMPUTED.
   * Attaching this to `close_pct` is the exact defect this module exists to
   * prevent; `labels.test.ts` fails the build if the literal reappears in a
   * component.
   */
  close: "Close %",
} as const;

/**
 * Denominator, spelled out. Every displayed percentage must be able to answer
 * "percent of what?" without the reader opening the code.
 */
export const METRIC_FORMULAS: Record<keyof typeof METRIC_LABELS, string> = {
  demoToSale: "Sales ÷ demos",
  demo: "Demos ÷ gross issued",
  issue: "Issued ÷ sets",
  goodRate: "(Sold − cancelled) ÷ sold $",
  ko: "Cancelled jobs ÷ sold",
  close: "Sales ÷ leads issued (Monday report definition — not yet computed)",
};

/** Label plus its denominator, for tooltips and glossary rows. */
export function labelWithFormula(key: keyof typeof METRIC_LABELS): string {
  return `${METRIC_LABELS[key]} — ${METRIC_FORMULAS[key]}`;
}
