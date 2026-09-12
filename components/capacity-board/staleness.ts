/**
 * Freshness decision for the Appointment Capacity board.
 *
 * WHY THIS IS ITS OWN MODULE. On 2026-09-12 the board displayed
 * "DATA STALE — last update 9:56 AM (80 min ago)", dimmed and greyed, over
 * numbers that were verifiably CORRECT. Lead Perfection's GetSalesSchedule was
 * timing out, so rep availability (the board's DENOMINATOR) had stopped
 * refreshing — but the appointment counts (the NUMERATOR, fed by a separate
 * lead pass) were live. A single `stale` boolean cannot express "half of this
 * is behind", so the board condemned itself wholesale and the people reading it
 * learned to distrust the banner.
 *
 * Two levels instead of one:
 *
 *   hardStale    The board genuinely cannot be trusted — no data at all, the
 *                poll is dead, both halves are old, or LP-MCP says the sweep is
 *                broken. Dim the numbers and show the full-screen overlay.
 *
 * A NOTE ON THE NUMERATOR, learned the hard way. Its staleness must come from
 * whether the pipeline RAN (appointments_checked_at), never from when the data
 * last CHANGED (appointments_updated_at). The first cut used the latter and
 * reported "broken" on a quiet Saturday while the sync engine was demonstrably
 * alive — blanking the wall over correct numbers, which is the failure this
 * whole module exists to prevent. This component only reads the server's
 * booleans, but the distinction is why they are shaped the way they are.
 *   partialStale Only rep availability is behind. Still red, still loud, but
 *                say WHICH half and leave the live counts legible. Greying out
 *                numbers that are right is what taught everyone to ignore this.
 *
 * Kept pure and separate from CapacityBoard.tsx so the decision is unit-tested
 * rather than eyeballed on a wall display, and so the mobile banner, the TV
 * banner and the TV overlay all read from ONE derivation. They previously
 * carried three hand-written strings, which is how they drifted apart.
 */

export type SweepState = "ok" | "failing" | "broken";

/** The freshness-bearing subset of the board payload. All fields optional: an
 *  older LP-MCP omits the split ones and we fall back to the blanket flag. */
export type StalenessInput = {
  stale?: boolean;
  capacity_swept_at?: string | null;
  last_sweep_at?: string | null;
  /** Last CHANGE to this date's appointments. Informational only — it moves
   *  when data changes, not when the pipeline runs, so a quiet stretch looks
   *  identical to a dead feed. Never use it as a liveness signal. */
  appointments_updated_at?: string | null;
  /** Last healthy numerator PASS — the actual liveness signal. */
  appointments_checked_at?: string | null;
  capacity_stale?: boolean;
  appointments_stale?: boolean;
  sweep_fail_streak?: number;
  sweep_state?: SweepState;
};

export type Staleness = {
  hardStale: boolean;
  partialStale: boolean;
  /** "show red": banner visible, clock in the alarm colour. */
  stale: boolean;
  capacityStale: boolean;
  apptsStale: boolean;
  /** Age in whole minutes of the stamp the banner quotes, or null if unknown. */
  ageMin: number | null;
  /** ET wall-clock time of that stamp, or an em dash. */
  updatedTime: string;
  /** "80 min ago" / "no sweep yet". */
  updatedAgo: string;
  /** Mobile banner: one line. */
  staleLine: string;
  /** TV banner: bold headline. */
  staleHeadline: string;
  /** TV banner: the sentence after the headline. */
  staleDetail: string;
};

const ET = "America/New_York";

/** 3 consecutive misses ≈ 3 min at a 60s poll — still inside the server's own
 *  freshness window, so one dropped fetch must not read as stale data. */
export const POLL_FAIL_TOLERANCE = 3;

export function deriveStaleness(
  data: StalenessInput | null | undefined,
  failStreak: number,
  now: number,
): Staleness {
  const apptsStale = data?.appointments_stale === true;
  const capacityStale = data?.capacity_stale ?? data?.stale ?? true;

  const hardStale =
    failStreak >= POLL_FAIL_TOLERANCE ||
    !data ||
    data.sweep_state === "broken" ||
    (capacityStale && apptsStale);
  const partialStale = !hardStale && capacityStale;

  // Prefer the VIEWED DATE's own capacity stamp over the table-wide
  // max(swept_at): the latter answers a different question and can read fresh
  // while the date on screen is not, or the reverse.
  const stamp = data?.capacity_swept_at ?? data?.last_sweep_at ?? null;
  const stampMs = stamp ? new Date(stamp).getTime() : null;
  const valid = stampMs !== null && Number.isFinite(stampMs);

  const ageMin = valid ? Math.max(0, Math.round((now - (stampMs as number)) / 60_000)) : null;
  const updatedTime = valid
    ? new Date(stampMs as number).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: ET,
      })
    : "—";
  const updatedAgo = ageMin === null ? "no sweep yet" : `${ageMin} min ago`;

  const staleHeadline = hardStale ? "DATA STALE" : "REP AVAILABILITY STALE";
  const staleDetail = hardStale
    ? !data
      ? "No data yet — retrying automatically."
      : "These numbers may be wrong. Check the sync."
    : `Rep availability ${updatedAgo} — appointment counts are live.`;
  const staleLine = hardStale
    ? `DATA STALE — last update ${updatedTime} (${updatedAgo})`
    : `REP AVAILABILITY ${updatedAgo.toUpperCase()} — appointment counts are live`;

  return {
    hardStale,
    partialStale,
    stale: hardStale || partialStale,
    capacityStale,
    apptsStale,
    ageMin,
    updatedTime,
    updatedAgo,
    staleLine,
    staleHeadline,
    staleDetail,
  };
}
