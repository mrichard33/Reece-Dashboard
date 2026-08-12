import { describe, expect, it } from "vitest";
import { formatPace, formatPaceShort } from "./paceLanguage";

// ── §2 — a market ahead of pace must READ as ahead of pace ─────────────────
//
// The brief's worked example: 25% of the goal banked, 23% of the selling days
// gone. The old caption said "109% goal", which invites the reading that this
// market has banked 109% of its target. It has banked 25%, and it is 2 points
// ahead. Same fact, said out loud.

describe("§2 — achieved vs elapsed, in points", () => {
  it("renders the brief's example verbatim", () => {
    expect(formatPace({ achievedPct: 25, elapsedPct: 23 })).toBe(
      "25% achieved / 23% elapsed · +2 pts ahead of pace",
    );
  });

  it("says behind pace when the delta is negative", () => {
    expect(formatPace({ achievedPct: 18, elapsedPct: 23 })).toBe(
      "18% achieved / 23% elapsed · -5 pts behind pace",
    );
  });

  it("says on pace at exactly zero, without a signed zero", () => {
    const s = formatPace({ achievedPct: 23, elapsedPct: 23 });
    expect(s).toBe("23% achieved / 23% elapsed · on pace");
    expect(s).not.toContain("+0");
    expect(s).not.toContain("-0");
  });

  it("never renders '-0 pts' from a rounding artefact", () => {
    // 22.6 and 23.4 both round to 23 → delta 0, not −1 and not −0.
    expect(formatPace({ achievedPct: 22.6, elapsedPct: 23.4 })).toBe(
      "23% achieved / 23% elapsed · on pace",
    );
  });

  it("subtracts the DISPLAYED figures so the sentence is self-consistent", () => {
    // A reader subtracting 23 from 25 must get the 2 the line claims — even
    // though the raw inputs are 25.4 and 22.5 (raw delta 2.9).
    expect(formatPace({ achievedPct: 25.4, elapsedPct: 22.5 })).toBe(
      "25% achieved / 23% elapsed · +2 pts ahead of pace",
    );
  });

  it("returns null when either figure is unmeasured — never a fabricated 0%", () => {
    expect(formatPace({ achievedPct: null, elapsedPct: 23 })).toBeNull();
    expect(formatPace({ achievedPct: 25, elapsedPct: null })).toBeNull();
    expect(formatPaceShort({ achievedPct: null, elapsedPct: null })).toBeNull();
  });

  it("short form carries both figures and the delta", () => {
    expect(formatPaceShort({ achievedPct: 25, elapsedPct: 23 })).toBe("25% / 23% · +2 pts");
  });
});

/**
 * §3 — THE COLOUR KEYS ON pace_delta_points, NEVER ON pct_of_monthly_goal.
 *
 * The trap the contract names: 25% of the goal banked at 23% of the month
 * elapsed is AHEAD. A rule that coloured on "% of monthly goal" would paint
 * that red for three weeks and green in the last, on a market that was never
 * behind — and by the time it turned green the information was worthless.
 *
 * The scorecard colours on `pctToGoal` (net ÷ the PRORATED to-date goal), which
 * is not a second calculation: because `prorateGoal` is linear,
 *
 *     pctToGoal ≥ 100  ⟺  achievedPct ≥ elapsedPct  ⟺  paceDeltaPts ≥ 0
 *
 * These pin that equivalence from the language side, so a future change to the
 * band cannot leave the sentence saying "ahead" on a red bar.
 */
describe("§3 — pace verdict follows the delta, not the share of goal", () => {
  it("25% achieved at 23% elapsed is AHEAD, not 25% of the way to failure", () => {
    const s = formatPace({ achievedPct: 25, elapsedPct: 23 });
    expect(s).toMatch(/ahead/i);
    expect(s).not.toMatch(/behind/i);
  });

  it("a HIGH share of goal can still be behind, and a LOW one ahead", () => {
    // The two cases that prove the verdict is not reading the share.
    expect(formatPace({ achievedPct: 90, elapsedPct: 96 })).toMatch(/behind/i);
    expect(formatPace({ achievedPct: 8, elapsedPct: 4 })).toMatch(/ahead/i);
  });

  it("the verdict flips exactly at the delta's sign change, at every share", () => {
    for (const elapsed of [4, 23, 50, 77, 96]) {
      expect(formatPace({ achievedPct: elapsed + 1, elapsedPct: elapsed })).toMatch(/ahead/i);
      expect(formatPace({ achievedPct: elapsed - 1, elapsedPct: elapsed })).toMatch(/behind/i);
    }
  });

  it("THE NUMBER IS ALWAYS VISIBLE — colour is never the only signal", () => {
    // §3: "Number always visible; never colour-only." A colour-blind reader, a
    // greyscale print and a screenshot in a deck all have to carry the verdict.
    const s = formatPace({ achievedPct: 25, elapsedPct: 23 })!;
    expect(s).toMatch(/25/);
    expect(s).toMatch(/23/);
    expect(s).toMatch(/pts/);
  });
});
