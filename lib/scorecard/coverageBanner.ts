/**
 * When the scorecard raises a PAGE-LEVEL coverage banner (Amendments D1, D2).
 *
 * ══ D2 — A CLOSED PERIOD IS COMPLETE BY DEFINITION ══
 *
 * The banner read "Every current-period figure on this page is reported through
 * 07-31-2026" while July was selected — a closed month, where reaching the last
 * day of the month is the expected end state rather than a shortfall. It is the
 * same error as §10's MIN-across-a-range: a COMPLETENESS date read as staleness.
 *
 * Staleness is only information while figures can still move. Once the period
 * has closed, "the source stopped at the period end" is what success looks like.
 *
 * ══ D1 — SCOPE FOLLOWS REACH ══
 *
 * A source feeding exactly ONE panel raises a note on that panel; only a source
 * feeding the page's PRIMARY figures may raise a page-level banner. RTP
 * (report 134) used to raise one whose own text said it "affects the Released
 * panel only" — a page-level alarm documenting its own irrelevance. It now
 * renders on the Released card (see RevenueCard `releasedWhere`), which is why
 * no RTP input appears in this gate at all.
 *
 * ══ WHAT SURVIVES A CLOSED PERIOD ══
 *
 * A MISSING month. That is a hole in the data rather than a clock reading, and
 * it is equally wrong whether the period closed or not — a period total that
 * silently omits a month understates without saying so.
 */
export type CoverageBannerInput = {
  /** The selected period includes today, so figures can still move. */
  periodIncludesToday: boolean;
  /** Sources behind the reporting cutoff. */
  laggingCount: number;
  /** Sources running PAST the cutoff — data newer than the period allows. */
  refusedCount: number;
  /** Months in range with no cohort at all. Named, so the banner can say which. */
  missingMonths: readonly string[];
};

export function shouldShowCoverageBanner(input: CoverageBannerInput): boolean {
  // A hole is a hole regardless of whether the period has closed.
  if (input.missingMonths.length > 0) return true;
  // Everything else is a statement about how far a still-moving period reaches.
  if (!input.periodIncludesToday) return false;
  return input.laggingCount > 0 || input.refusedCount > 0;
}

/**
 * Which months a period should contain, as `YYYY-MM`.
 *
 * Compared against the months that actually fed the total, the difference NAMES
 * the missing month rather than reporting a count mismatch — a banner that
 * cannot say which month is absent cannot be acted on.
 */
export function monthsInRange(periodStart: string, periodEnd: string): string[] {
  const out: string[] = [];
  const [y0, m0] = periodStart.slice(0, 7).split("-").map(Number);
  if (!y0 || !m0) return out;
  const end = periodEnd.slice(0, 7);
  let y = y0;
  let m = m0;
  // Bounded: a range wider than ten years is a bug, not a request.
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    out.push(key);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
