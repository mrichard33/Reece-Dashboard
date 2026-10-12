import { describe, expect, it } from "vitest";
import {
  NEEDS_RULING,
  daysInState,
  daysLabel,
  evidenceLabel,
  sortModes,
  stateBadge,
  summarizeModes,
  toModeItems,
  type FeatureModeRow,
} from "@/lib/queries/modes.core";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function row(over: Partial<FeatureModeRow>): FeatureModeRow {
  return {
    name: "X_MODE",
    mode_group: "bot",
    kind: "enum",
    current_value: "shadow",
    current_state: "shadow",
    is_set: false,
    default_value: "shadow",
    allowed_values: ["off", "shadow", "live"],
    since: "2026-10-01",
    decider: "Mark",
    evidence: {},
    go_live: NEEDS_RULING,
    note: "A flag.",
    registered_at: "2026-10-20T00:00:00Z",
    state_changed_at: null,
    ...over,
  };
}

describe("daysInState", () => {
  it("counts from a recorded change first", () => {
    expect(daysInState({ state_changed_at: "2026-10-18T12:00:00Z", since: "2026-01-01" }, NOW)).toEqual({ days: 2, fromSince: false });
  });
  it("falls back to the first commit date and says so", () => {
    expect(daysInState({ state_changed_at: null, since: "2026-10-01" }, NOW)).toEqual({ days: 19, fromSince: true });
  });
  it("is unknown with neither", () => {
    expect(daysInState({ state_changed_at: null, since: null }, NOW)).toEqual({ days: null, fromSince: false });
  });
});

describe("toModeItems", () => {
  it("marks a shadow flag due for review at 14 days, never a live one", () => {
    const [a, b, c] = toModeItems(
      [
        row({ name: "A_MODE", since: "2026-10-06" }),
        row({ name: "B_MODE", since: "2026-10-07" }),
        row({ name: "C_MODE", current_state: "live", current_value: "live", since: "2026-01-01" }),
      ],
      NOW,
    );
    expect(a?.dueForReview).toBe(true);
    expect(b?.dueForReview).toBe(false);
    expect(c?.dueForReview).toBe(false);
  });

  it("keeps the event count only for flags that record events", () => {
    const [a, b] = toModeItems(
      [row({ name: "A_MODE", evidence: { events: ["send_gate.would_block"] } }), row({ name: "B_MODE", evidence: { job: "j" } })],
      NOW,
      { A_MODE: 12, B_MODE: 99 },
    );
    expect(a?.events7d).toBe(12);
    expect(b?.events7d).toBeNull();
  });

  it("treats a missing go-live test as no ruling", () => {
    const [a, b] = toModeItems([row({ go_live: null }), row({ go_live: "a real test" })], NOW);
    expect(a?.hasRuling).toBe(false);
    expect(a?.goLive).toBe(NEEDS_RULING);
    expect(b?.hasRuling).toBe(true);
  });
});

describe("summarizeModes and sortModes", () => {
  const items = toModeItems(
    [
      row({ name: "LIVE_MODE", current_state: "live", current_value: "live" }),
      row({ name: "OLD_MODE", since: "2026-09-01", go_live: "a test" }),
      row({ name: "NEW_MODE", since: "2026-10-15" }),
      row({ name: "TYPO_MODE", current_state: "other", current_value: "shaddow" }),
      row({ name: "OFF_MODE", current_state: "off", current_value: "off" }),
      row({ name: "SET_MODE", kind: "choice", current_state: "choice", current_value: "five9" }),
    ],
    NOW,
  );

  it("counts each state, the ones due, and shadow flags with no ruling", () => {
    expect(summarizeModes(items)).toEqual({ total: 6, shadow: 2, live: 1, off: 1, other: 1, dueForReview: 1, noRuling: 1 });
  });

  it("puts an unknown value first, then shadow longest-waiting first", () => {
    expect(sortModes(items).map((i) => i.name)).toEqual(["TYPO_MODE", "OLD_MODE", "NEW_MODE", "OFF_MODE", "LIVE_MODE", "SET_MODE"]);
  });
});

describe("labels", () => {
  it("names each state in plain words", () => {
    expect(stateBadge("shadow")).toEqual({ label: "Test mode", tone: "amber" });
    expect(stateBadge("other").tone).toBe("rose");
  });

  it("describes where the evidence is", () => {
    expect(evidenceLabel({ evidence: {}, events7d: null })).toBe("logs only");
    expect(evidenceLabel({ evidence: { events: ["a.would_x"] }, events7d: 1 })).toBe("1 event in 7 days");
    expect(evidenceLabel({ evidence: { table: "tool_audit_log", job: "j" }, events7d: null })).toBe("table tool_audit_log · job j");
  });

  it("says when the day count starts at the first commit", () => {
    expect(daysLabel({ daysInState: 19, daysFromSince: true })).toBe("19 days (since added)");
    expect(daysLabel({ daysInState: 1, daysFromSince: false })).toBe("1 day");
    expect(daysLabel({ daysInState: null, daysFromSince: false })).toBe("—");
  });
});
