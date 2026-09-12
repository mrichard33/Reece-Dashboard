import { describe, it, expect } from "vitest";
import { deriveStaleness, POLL_FAIL_TOLERANCE, type StalenessInput } from "../staleness";

/**
 * WHAT THIS PROTECTS. The board's banner is the only signal anyone gets that
 * the capacity pipeline is unwell, and on 2026-09-12 it lied in the expensive
 * direction: "DATA STALE — last update 9:56 AM (80 min ago)", dimmed and
 * greyed, over appointment counts that were verifiably correct. Rep
 * availability had stopped refreshing because LP's GetSalesSchedule was timing
 * out; the counts, fed by a separate pass, were live.
 *
 * Two failure modes to hold apart, and both are costly:
 *   - Crying wolf teaches the floor to ignore a red board.
 *   - Under-reporting leaves people booking against numbers that are wrong.
 * Every case below pins one side of that line.
 */

const NOW = Date.parse("2026-09-12T15:16:00.000Z"); // 11:16 ET, the screenshot
const minsAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

/** A healthy payload: both halves swept a minute ago. */
const fresh = (over: Partial<StalenessInput> = {}): StalenessInput => ({
  stale: false,
  capacity_swept_at: minsAgo(1),
  last_sweep_at: minsAgo(1),
  appointments_updated_at: minsAgo(1),
  capacity_stale: false,
  appointments_stale: false,
  sweep_fail_streak: 0,
  sweep_state: "ok",
  ...over,
});

describe("a healthy board says nothing", () => {
  it("is neither hard nor partially stale", () => {
    const s = deriveStaleness(fresh(), 0, NOW);
    expect(s.stale).toBe(false);
    expect(s.hardStale).toBe(false);
    expect(s.partialStale).toBe(false);
  });

  it("reports the age off the viewed date's own capacity stamp", () => {
    const s = deriveStaleness(fresh({ capacity_swept_at: minsAgo(7) }), 0, NOW);
    expect(s.ageMin).toBe(7);
    expect(s.updatedAgo).toBe("7 min ago");
  });

  it("prefers capacity_swept_at over the table-wide last_sweep_at", () => {
    // The two answer different questions: last_sweep_at is a global max and can
    // read fresh while the date on screen has not been swept.
    const s = deriveStaleness(
      fresh({ capacity_swept_at: minsAgo(50), last_sweep_at: minsAgo(1), capacity_stale: true }),
      0,
      NOW,
    );
    expect(s.ageMin).toBe(50);
  });
});

describe("THE REGRESSION: only rep availability is behind", () => {
  // Exactly the 2026-09-12 shape: denominator 80 min old, counts live.
  const partial = fresh({
    stale: true,
    capacity_stale: true,
    capacity_swept_at: minsAgo(80),
    appointments_stale: false,
    appointments_updated_at: minsAgo(1),
    sweep_state: "failing",
    sweep_fail_streak: 16,
  });

  it("is partially stale, NOT hard stale", () => {
    const s = deriveStaleness(partial, 0, NOW);
    expect(s.partialStale).toBe(true);
    expect(s.hardStale).toBe(false);
  });

  it("still shows red — this is a real problem, just not the one the old copy claimed", () => {
    expect(deriveStaleness(partial, 0, NOW).stale).toBe(true);
  });

  it("names rep availability and says the counts are live", () => {
    const s = deriveStaleness(partial, 0, NOW);
    expect(s.staleLine).toBe("REP AVAILABILITY 80 MIN AGO — appointment counts are live");
    expect(s.staleHeadline).toBe("REP AVAILABILITY STALE");
    expect(s.staleDetail).toContain("appointment counts are live");
  });

  it("does NOT claim the whole board is stale", () => {
    const s = deriveStaleness(partial, 0, NOW);
    expect(s.staleLine).not.toContain("DATA STALE");
    expect(s.staleDetail).not.toContain("may be wrong");
  });
});

describe("hard stale: the board genuinely cannot be trusted", () => {
  it("both halves old", () => {
    const s = deriveStaleness(
      fresh({
        capacity_stale: true,
        appointments_stale: true,
        capacity_swept_at: minsAgo(200),
        appointments_updated_at: minsAgo(400),
      }),
      0,
      NOW,
    );
    expect(s.hardStale).toBe(true);
    expect(s.partialStale).toBe(false);
    expect(s.staleLine).toContain("DATA STALE");
  });

  it("LP-MCP reporting sweep_state broken overrides a fresh-looking numerator", () => {
    const s = deriveStaleness(fresh({ sweep_state: "broken", capacity_stale: true }), 0, NOW);
    expect(s.hardStale).toBe(true);
  });

  it("a dead poll is hard stale even when the last payload looked perfect", () => {
    // The numbers on screen are frozen client-side; nothing about the payload
    // tells you that, so the streak has to.
    const s = deriveStaleness(fresh(), POLL_FAIL_TOLERANCE, NOW);
    expect(s.hardStale).toBe(true);
  });

  it("tolerates a blip short of the streak", () => {
    const s = deriveStaleness(fresh(), POLL_FAIL_TOLERANCE - 1, NOW);
    expect(s.hardStale).toBe(false);
    expect(s.stale).toBe(false);
  });

  it("no data at all", () => {
    const s = deriveStaleness(null, 0, NOW);
    expect(s.hardStale).toBe(true);
    expect(s.ageMin).toBeNull();
    expect(s.updatedTime).toBe("—");
    expect(s.updatedAgo).toBe("no sweep yet");
    expect(s.staleDetail).toContain("No data yet");
  });
});

describe("degraded and malformed inputs never read as fresh", () => {
  it("an upstream with no split fields falls back to the blanket stale flag", () => {
    // An older LP-MCP omits capacity_stale entirely. Must still work.
    const s = deriveStaleness({ stale: true, last_sweep_at: minsAgo(80) }, 0, NOW);
    expect(s.stale).toBe(true);
    expect(s.capacityStale).toBe(true);
    expect(s.ageMin).toBe(80);
  });

  it("an older upstream reporting healthy is trusted", () => {
    const s = deriveStaleness({ stale: false, last_sweep_at: minsAgo(2) }, 0, NOW);
    expect(s.stale).toBe(false);
  });

  it("an empty payload is stale — unknown freshness is not freshness", () => {
    const s = deriveStaleness({}, 0, NOW);
    expect(s.capacityStale).toBe(true);
    expect(s.stale).toBe(true);
  });

  it("an unparseable timestamp does not produce NaN on screen", () => {
    const s = deriveStaleness({ stale: true, capacity_swept_at: "not-a-date" }, 0, NOW);
    expect(s.ageMin).toBeNull();
    expect(s.updatedTime).toBe("—");
    expect(s.staleLine).not.toContain("NaN");
  });

  it("a null timestamp does not produce NaN on screen", () => {
    const s = deriveStaleness({ stale: true, capacity_swept_at: null, last_sweep_at: null }, 0, NOW);
    expect(s.ageMin).toBeNull();
    expect(s.staleLine).not.toContain("NaN");
  });

  it("a stamp in the future clamps to 0 rather than going negative", () => {
    const s = deriveStaleness(fresh({ capacity_swept_at: minsAgo(-30) }), 0, NOW);
    expect(s.ageMin).toBe(0);
  });

  it("a quiet numerator is not a fault on its own", () => {
    // Dispositions only move when something changes; a quiet hour with fresh
    // capacity must stay green rather than nagging.
    const s = deriveStaleness(fresh({ appointments_updated_at: minsAgo(300) }), 0, NOW);
    expect(s.stale).toBe(false);
  });
});
