/**
 * Reece closure calendar — THE single source of truth for company holidays.
 *
 * Working days are Mon–Sat MINUS these closures (see lib/date/sellingDays.ts).
 * This is a Reece BUSINESS-closure list, NOT the US federal-holiday calendar:
 * Juneteenth / Columbus / Veterans Day stay selling days, while the day after
 * Thanksgiving and Christmas Eve ARE closures even though they are not federal
 * holidays. Fixed-date holidays that fall on a weekend are OBSERVED on the nearest
 * weekday (Sat → prior Fri, Sun → next Mon); for the frozen years below the
 * observed dates are written out explicitly so there is zero ambiguity.
 *
 * ⚠ DO NOT compute holidays anywhere else in the dashboard — import
 * `reeceHolidays` / `REECE_HOLIDAYS` from here. This is the read-side mirror of the
 * LP-MCP selling-day module (the server-side source of truth) and MUST stay in sync
 * with the frozen `working_days` in scorecard_goals_monthly.
 *
 * 2026 closures (8) → Mon–Sat working days per month:
 *   Jan 26 · Feb 24 · Mar 26 · Apr 26 · May 25 · Jun 26 ·
 *   Jul 26 · Aug 26 · Sep 25 · Oct 27 · Nov 23 · Dec 25  →  YEAR = 305.
 */

/** Explicitly frozen closure lists (YYYY-MM-DD, observed dates already applied). */
export const REECE_HOLIDAYS: Record<number, readonly string[]> = {
  2026: [
    "2026-01-01", // New Year's Day (Thu)
    "2026-05-25", // Memorial Day (Mon)
    "2026-07-03", // Independence Day — observed (Fri; Jul 4 falls on Sat)
    "2026-09-07", // Labor Day (Mon)
    "2026-11-26", // Thanksgiving (Thu)
    "2026-11-27", // Day after Thanksgiving (Fri)
    "2026-12-24", // Christmas Eve (Thu)
    "2026-12-25", // Christmas Day (Fri)
  ],
};

/** UTC day-of-week (0=Sun..6=Sat) for a Y/M/D, noon-anchored to dodge DST edges. */
function dow(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Nth `weekday` (0=Sun..6=Sat) of `month` — e.g. 4th Thursday of Nov. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = dow(year, month, 1);
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return ymd(year, month, day);
}

/** Last `weekday` of `month` — e.g. last Monday of May (Memorial Day). */
function lastWeekday(year: number, month: number, weekday: number): string {
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
  const last = dow(year, month, daysInMonth);
  const day = daysInMonth - ((last - weekday + 7) % 7);
  return ymd(year, month, day);
}

/** A fixed-date holiday, shifted to the nearest weekday when it lands on a weekend. */
function observedFixed(year: number, month: number, day: number): string {
  const d = dow(year, month, day);
  if (d === 6) return ymd(year, month, day - 1); // Sat → prior Fri
  if (d === 0) return ymd(year, month, day + 1); // Sun → next Mon
  return ymd(year, month, day);
}

/**
 * Computed fallback for years not explicitly frozen above. Mirrors the Reece
 * closure pattern (weekend-observed fixed holidays + the movable Mon/Thu ones)
 * so a future year never degrades to "no closures". Frozen years should be added
 * to REECE_HOLIDAYS and validated against the working_days table.
 */
function computedHolidays(year: number): Set<string> {
  return new Set([
    observedFixed(year, 1, 1), // New Year's Day
    lastWeekday(year, 5, 1), // Memorial Day — last Monday of May
    observedFixed(year, 7, 4), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day — 1st Monday of September
    nthWeekday(year, 11, 4, 4), // Thanksgiving — 4th Thursday of November
    ymd(year, 11, Number(nthWeekday(year, 11, 4, 4).slice(8)) + 1), // day after Thanksgiving
    observedFixed(year, 12, 24), // Christmas Eve
    observedFixed(year, 12, 25), // Christmas Day
  ]);
}

/** Closures for `year` as a Set of YYYY-MM-DD. Frozen list if present, else computed. */
export function reeceHolidays(year: number): Set<string> {
  const frozen = REECE_HOLIDAYS[year];
  return frozen ? new Set(frozen) : computedHolidays(year);
}
