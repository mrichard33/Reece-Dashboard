/**
 * Freshness recomputation for replayed capacity-board payloads.
 *
 * WHY IT EXISTS. The /api/capacity-board proxy holds the last successful board
 * payload per date and replays it rather than blanking seven wall TVs on a
 * transient 502. But `stale` and friends are computed by LP-MCP at response
 * time and frozen into the body, so replaying verbatim would keep asserting
 * `stale: false` forever while the data quietly rotted. Every freshness field
 * is therefore recomputed on replay, and only ever escalates.
 *
 * THE NUMERATOR RULE, learned the hard way. Numerator staleness must come from
 * `appointments_checked_at` — when the pipeline last RAN a healthy pass — and
 * never from `appointments_updated_at`, which is when this date's appointments
 * last CHANGED. The first cut used the latter and was wrong within minutes of
 * deploy: on a quiet Saturday looking at a Sunday, tomorrow's eleven
 * appointments had not changed since the previous evening while the sync engine
 * was demonstrably alive. The payload reported `sweep_state: "broken"`, which
 * fires the board's full-screen overlay — so the "honest freshness" code blanked
 * the wall over correct numbers, the exact failure the split was built to remove.
 *
 * Extracted from the route handler so this is unit-tested directly rather than
 * through Next's request plumbing.
 */

export type SweepState = "ok" | "failing" | "broken";

export type BoardPayload = {
  last_sweep_at?: string | null;
  stale?: boolean;
  stale_after_ms?: number;
  // Split freshness (LP-MCP, 2026-09-12). The denominator (rep availability)
  // and the numerator (appointment counts) fail independently: a slow LP
  // GetSalesSchedule freezes the former while the lead pass keeps the latter
  // current. One blanket `stale` flag could not express that, so the board
  // condemned correct numbers.
  capacity_swept_at?: string | null;
  /** Last CHANGE to this date's appointments. Informational — NOT a liveness
   *  signal: it only moves when a lead's data actually changes, so a quiet
   *  stretch is indistinguishable from a dead pipeline. */
  appointments_updated_at?: string | null;
  /** Last healthy numerator PASS. This is the liveness signal. */
  appointments_checked_at?: string | null;
  capacity_stale?: boolean;
  appointments_stale?: boolean;
  sweep_fail_streak?: number;
  sweep_state?: SweepState;
  [key: string]: unknown;
};

/** Mirrors LP-MCP's own default when the payload omits stale_after_ms. */
export const DEFAULT_STALE_AFTER_MS = 2_700_000; // 45 min

/** The lead pass runs for tens of minutes per cycle by design, so numerator
 *  liveness gets a far longer leash than the 5-minute denominator sweep. */
const APPTS_LEASH_MULTIPLIER = 4;

/** True when `ts` is missing, unparseable, or older than `limitMs`. Unknown
 *  freshness is not freshness. */
function agedBeyond(ts: string | null | undefined, limitMs: number, now: number): boolean {
  if (!ts) return true;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? true : now - parsed > limitMs;
}

export function withHonestStale(body: BoardPayload, now: number = Date.now()): BoardPayload {
  const staleAfterMs =
    typeof body.stale_after_ms === "number" ? body.stale_after_ms : DEFAULT_STALE_AFTER_MS;

  const aged = agedBeyond(body.last_sweep_at, staleAfterMs, now);

  // Fall back to last_sweep_at when the upstream predates the split fields, so
  // an older LP-MCP still produces a coherent banner rather than "unknown".
  const capacityStale =
    body.capacity_stale === true ||
    agedBeyond(body.capacity_swept_at ?? body.last_sweep_at, staleAfterMs, now);

  // Liveness from the PASS, never from the data's last change. An upstream that
  // reports no checked-at at all is left to its own boolean rather than guessed
  // at — guessing is what produced the false "broken".
  const appointmentsStale =
    body.appointments_stale === true ||
    (body.appointments_checked_at
      ? agedBeyond(body.appointments_checked_at, staleAfterMs * APPTS_LEASH_MULTIPLIER, now)
      : false);

  const failStreak = typeof body.sweep_fail_streak === "number" ? body.sweep_fail_streak : 0;
  const sweepState: SweepState =
    body.sweep_state === "broken" || (capacityStale && appointmentsStale)
      ? "broken"
      : capacityStale || failStreak > 0 || body.sweep_state === "failing"
        ? "failing"
        : "ok";

  return {
    ...body,
    stale: body.stale === true || aged,
    capacity_stale: capacityStale,
    appointments_stale: appointmentsStale,
    sweep_state: sweepState,
    // Diagnostic only — the board ignores unknown fields.
    served_from: "last-known-good",
  };
}
