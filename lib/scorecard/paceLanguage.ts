/**
 * Pace language for the By Market cards.
 *
 * WHAT THIS IS NOT: a new calculation. `pctToGoal` already divides net by the
 * PRORATED to-date goal (`byMarket.ts`), and `prorateGoal` is linear
 * (`paceTargets.ts`), so
 *
 *     pctToGoal ≥ 100  ⟺  net/periodGoal ≥ elapsed/workingDays  ⟺  delta ≥ 0
 *
 * The verdict and its colour band are untouched. This module only re-expresses
 * the same ratio in the two numbers a sales manager actually reasons with —
 * "how much of the goal is banked" against "how much of the month is gone".
 *
 * The caption it replaces read `109% goal`, which invites exactly the wrong
 * reading: that a market with 25% of its money in has somehow banked 109% of
 * the target. It has banked 25%, on 23% of the selling days, and is 2 points
 * ahead. Same fact, said out loud.
 */

/** Round to a whole percent for display; keeps −0 from rendering as "-0". */
const whole = (v: number): number => {
  const r = Math.round(v);
  return Object.is(r, -0) ? 0 : r;
};

export type PaceInput = {
  /** net ÷ FULL-period goal × 100. */
  achievedPct: number | null;
  /** selling days elapsed ÷ selling days in period × 100. */
  elapsedPct: number | null;
};

/**
 * "25% achieved / 23% elapsed · +2 pts ahead of pace".
 *
 * Null when either input is null — a market with no goal renders "—" rather
 * than a fabricated 0% that reads as total failure.
 */
export function formatPace({ achievedPct, elapsedPct }: PaceInput): string | null {
  if (achievedPct == null || elapsedPct == null) return null;
  const a = whole(achievedPct);
  const e = whole(elapsedPct);
  // Points off the DISPLAYED figures, so the sentence is self-consistent: a
  // reader subtracting 23 from 25 must get the same 2 the line claims.
  const delta = a - e;
  const verdict = delta > 0 ? "ahead of pace" : delta < 0 ? "behind pace" : "on pace";
  const signed = delta > 0 ? `+${delta}` : String(delta);
  return delta === 0
    ? `${a}% achieved / ${e}% elapsed · on pace`
    : `${a}% achieved / ${e}% elapsed · ${signed} pts ${verdict}`;
}

/** Short form for the desktop table cell, where the row already carries the dates. */
export function formatPaceShort({ achievedPct, elapsedPct }: PaceInput): string | null {
  if (achievedPct == null || elapsedPct == null) return null;
  const delta = whole(achievedPct) - whole(elapsedPct);
  const signed = delta > 0 ? `+${delta}` : String(delta);
  return `${whole(achievedPct)}% / ${whole(elapsedPct)}% · ${signed} pts`;
}
