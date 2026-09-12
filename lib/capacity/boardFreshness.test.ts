import { describe, it, expect } from "vitest";
import { withHonestStale, DEFAULT_STALE_AFTER_MS, type BoardPayload } from "./boardFreshness";

/**
 * The proxy replays the last good board payload rather than blanking seven wall
 * TVs on a transient 502, so every freshness field has to be recomputed instead
 * of echoed. These cases pin both directions of that:
 *   - a replay must never pass stale data off as fresh, and
 *   - it must never invent staleness that isn't there, because the escalation
 *     to "broken" fires a full-screen overlay over the numbers.
 *
 * The regression block is the bug this file was written for: numerator
 * staleness was first derived from `appointments_updated_at` (when the data last
 * CHANGED) instead of `appointments_checked_at` (when the pipeline last RAN). On
 * a quiet Saturday looking at a Sunday, tomorrow's eleven appointments hadn't
 * changed since the previous evening while the sync engine was demonstrably
 * alive — and the board declared itself broken.
 */

const NOW = Date.parse("2026-09-12T16:00:00.000Z");
const minsAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();
const LEASH = DEFAULT_STALE_AFTER_MS * 4; // numerator leash: 180 min

const base = (over: Partial<BoardPayload> = {}): BoardPayload => ({
  stale: false,
  stale_after_ms: DEFAULT_STALE_AFTER_MS,
  last_sweep_at: minsAgo(2),
  capacity_swept_at: minsAgo(2),
  capacity_stale: false,
  appointments_checked_at: minsAgo(5),
  appointments_updated_at: minsAgo(5),
  appointments_stale: false,
  sweep_fail_streak: 0,
  sweep_state: "ok",
  ...over,
});

describe("a replay recomputes freshness rather than echoing it", () => {
  it("tags the payload so replays are identifiable", () => {
    expect(withHonestStale(base(), NOW).served_from).toBe("last-known-good");
  });

  it("marks a once-healthy payload stale once it ages past the threshold", () => {
    const out = withHonestStale(base({ last_sweep_at: minsAgo(80), capacity_swept_at: minsAgo(80) }), NOW);
    expect(out.stale).toBe(true);
    expect(out.capacity_stale).toBe(true);
  });

  it("never clears a stale flag the server already set", () => {
    expect(withHonestStale(base({ stale: true }), NOW).stale).toBe(true);
    expect(withHonestStale(base({ capacity_stale: true }), NOW).capacity_stale).toBe(true);
    expect(withHonestStale(base({ appointments_stale: true }), NOW).appointments_stale).toBe(true);
  });

  it("leaves a genuinely fresh payload alone", () => {
    const out = withHonestStale(base(), NOW);
    expect(out.stale).toBe(false);
    expect(out.capacity_stale).toBe(false);
    expect(out.appointments_stale).toBe(false);
    expect(out.sweep_state).toBe("ok");
  });
});

describe("THE REGRESSION: a quiet numerator is not a dead one", () => {
  it("an old CHANGE time with a live PASS is not numerator staleness", () => {
    const out = withHonestStale(
      base({ appointments_updated_at: minsAgo(17 * 60), appointments_checked_at: minsAgo(4) }),
      NOW,
    );
    expect(out.appointments_stale).toBe(false);
  });

  it("and does NOT escalate a denominator-only problem to broken", () => {
    // The 2026-09-12 shape. "failing" renders the partial banner; "broken"
    // would blank the wall over counts that are correct.
    const out = withHonestStale(
      base({
        capacity_stale: true,
        capacity_swept_at: minsAgo(120),
        last_sweep_at: minsAgo(120),
        appointments_updated_at: minsAgo(17 * 60),
        appointments_checked_at: minsAgo(4),
        sweep_state: "failing",
      }),
      NOW,
    );
    expect(out.sweep_state).toBe("failing");
    expect(out.appointments_stale).toBe(false);
  });

  it("a genuinely dead pass IS numerator staleness", () => {
    const out = withHonestStale(base({ appointments_checked_at: minsAgo(600) }), NOW);
    expect(out.appointments_stale).toBe(true);
  });

  it("sits right at the leash boundary without flapping", () => {
    const inside = withHonestStale(
      base({ appointments_checked_at: new Date(NOW - LEASH + 1000).toISOString() }),
      NOW,
    );
    expect(inside.appointments_stale).toBe(false);
    const outside = withHonestStale(
      base({ appointments_checked_at: new Date(NOW - LEASH - 1000).toISOString() }),
      NOW,
    );
    expect(outside.appointments_stale).toBe(true);
  });

  it("both halves dead escalates to broken", () => {
    const out = withHonestStale(
      base({
        capacity_stale: true,
        capacity_swept_at: minsAgo(300),
        last_sweep_at: minsAgo(300),
        appointments_checked_at: minsAgo(600),
      }),
      NOW,
    );
    expect(out.sweep_state).toBe("broken");
  });

  it("an upstream with no checked_at is left to its own boolean, not guessed at", () => {
    const quiet = withHonestStale(
      base({ appointments_checked_at: undefined, appointments_updated_at: minsAgo(17 * 60) }),
      NOW,
    );
    expect(quiet.appointments_stale).toBe(false);

    const flagged = withHonestStale(
      base({ appointments_checked_at: undefined, appointments_stale: true }),
      NOW,
    );
    expect(flagged.appointments_stale).toBe(true);
  });
});

describe("degraded and malformed inputs never read as fresh", () => {
  it("an upstream predating the split fields falls back to last_sweep_at", () => {
    const out = withHonestStale({ stale: true, last_sweep_at: minsAgo(80) }, NOW);
    expect(out.stale).toBe(true);
    expect(out.capacity_stale).toBe(true);
    expect(out.sweep_state).toBe("failing");
  });

  it("an older healthy upstream is trusted", () => {
    const out = withHonestStale({ stale: false, last_sweep_at: minsAgo(2) }, NOW);
    expect(out.stale).toBe(false);
    expect(out.sweep_state).toBe("ok");
  });

  it("an empty payload is stale", () => {
    const out = withHonestStale({}, NOW);
    expect(out.stale).toBe(true);
    expect(out.capacity_stale).toBe(true);
  });

  it("an unparseable capacity stamp is stale, not fresh", () => {
    const out = withHonestStale(base({ capacity_swept_at: "not-a-date" }), NOW);
    expect(out.capacity_stale).toBe(true);
  });

  it("an unparseable checked_at is stale, not fresh", () => {
    const out = withHonestStale(base({ appointments_checked_at: "not-a-date" }), NOW);
    expect(out.appointments_stale).toBe(true);
  });

  it("a missing stale_after_ms uses LP-MCP's own default", () => {
    const justInside = withHonestStale(
      { last_sweep_at: new Date(NOW - DEFAULT_STALE_AFTER_MS + 1000).toISOString() },
      NOW,
    );
    expect(justInside.stale).toBe(false);
    const justOutside = withHonestStale(
      { last_sweep_at: new Date(NOW - DEFAULT_STALE_AFTER_MS - 1000).toISOString() },
      NOW,
    );
    expect(justOutside.stale).toBe(true);
  });

  it("a nonzero fail streak is enough to report failing", () => {
    expect(withHonestStale(base({ sweep_fail_streak: 1 }), NOW).sweep_state).toBe("failing");
  });

  it("passes through the payload's own fields untouched", () => {
    const out = withHonestStale(base({ totals: { requested: 37, confirmed: 6 } }), NOW);
    expect(out.totals).toEqual({ requested: 37, confirmed: 6 });
  });
});
