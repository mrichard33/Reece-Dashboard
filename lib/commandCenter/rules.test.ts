import { describe, expect, it } from "vitest";
import {
  buttonsFor, needsReason, verdictFor, stripOmiPrefix, isOmi,
  prefillDecisionText, errorMessageFor,
  type CardType, type QueueCard, type RuleAction,
} from "./rules";

/**
 * These rules are duplicated on purpose — memory-rule.js enforces them again on
 * the server. That makes the DUPLICATION the risk: if the page and the tool ever
 * disagree about when a reason is required, or about what an action's verdict is
 * called, the ruling bounces after the person already clicked. These tests pin
 * the page's half to the vocabulary the tool uses.
 */

const card = (over: Partial<QueueCard> = {}): QueueCard =>
  ({
    lane: "rulings", card_type: "decision_needed",
    source_table: "claude_pending_items", source_id: 1,
    description: "Pick a confirmation window", options: null, origin: "live",
    area: "appointments", created_at: "2026-09-01T00:00:00Z", age_days: 10,
    rec_verdict: null, rec_reason: null, rec_evidence: null, rec_confidence: null,
    rec_risk: null, rec_decision_text: null, rec_category: null, rec_build_text: null,
    rec_at: null, left_id: null, left_text: null, left_origin: null,
    left_confidence: null, left_date: null, left_status: null, left_rollout_stage: null,
    right_id: null, right_text: null, right_origin: null, right_confidence: null,
    right_date: null, right_status: null, right_rollout_stage: null,
    conflict_kind: null, similarity: null, blocks_count: 0, card_version: "v1",
    ...over,
  }) as QueueCard;

const actions = (t: CardType, options: string[] | null = null) =>
  buttonsFor({ card_type: t, options }).map((b) => b.action);

describe("card type → buttons", () => {
  it("a decision needed with options offers Pick option first", () => {
    expect(actions("decision_needed", ["a", "b"])).toEqual([
      "pick_option", "own_answer", "snooze", "not_relevant",
    ]);
  });

  it("a decision needed with NO options does not offer Pick option", () => {
    expect(actions("decision_needed")).toEqual(["own_answer", "snooze", "not_relevant"]);
  });

  it("an open question gets the same set as a decision needed", () => {
    expect(actions("open_question")).toEqual(actions("decision_needed"));
  });

  it("an unconfirmed / Omi card is approve, edit, reject, not now", () => {
    expect(actions("unconfirmed_decision")).toEqual([
      "approve", "edit_approve", "reject", "snooze",
    ]);
  });

  it("a conflict picks a side, dismisses, or replaces both", () => {
    expect(actions("conflict")).toEqual([
      "keep_left", "keep_right", "not_a_conflict", "new_answer",
    ]);
  });

  it("an approval is yes, no, not now", () => {
    expect(actions("approval_needed")).toEqual(["yes", "no", "snooze"]);
  });

  it("a conflict never offers snooze-as-not-relevant confusion", () => {
    // 'No longer relevant' on a conflict means 'not a conflict', so the plain
    // not_relevant button must not appear alongside it.
    expect(actions("conflict")).not.toContain("not_relevant");
  });

  it("every button that edits wording opens a dialog first", () => {
    const edit = buttonsFor({ card_type: "unconfirmed_decision", options: null })
      .find((b) => b.action === "edit_approve");
    expect(edit?.opens).toBe("approve");
    const own = buttonsFor({ card_type: "open_question", options: null })
      .find((b) => b.action === "own_answer");
    expect(own?.opens).toBe("approve");
  });
});

describe("when a reason is required", () => {
  it("a rejection always needs one, recommendation or not", () => {
    expect(needsReason("reject", null)).toBe(true);
    expect(needsReason("reject", "reject")).toBe(true);
    expect(needsReason("no", null)).toBe(true);
  });

  it("a flip always needs one", () => {
    expect(needsReason("flip", null)).toBe(true);
    expect(needsReason("flip", "approve")).toBe(true);
  });

  it("agreeing with the recommendation needs no reason", () => {
    expect(needsReason("approve", "approve")).toBe(false);
    expect(needsReason("keep_left", "keep_left")).toBe(false);
    expect(needsReason("yes", "yes")).toBe(false);
  });

  it("going against the recommendation needs one", () => {
    expect(needsReason("approve", "reject")).toBe(true);
    expect(needsReason("keep_left", "keep_right")).toBe(true);
    expect(needsReason("snooze", "approve")).toBe(true);
  });

  it("a card with NO recommendation never demands a reason for an ordinary ruling", () => {
    // The whole point: the nightly has not reached most of the backlog yet, and
    // a queue of 385 must not require 385 explanations.
    for (const a of ["approve", "yes", "keep_left", "own_answer", "snooze"] as RuleAction[]) {
      expect(needsReason(a, null)).toBe(false);
    }
  });

  it("edit_approve counts as approve, so it agrees with an approve recommendation", () => {
    expect(needsReason("edit_approve", "approve")).toBe(false);
  });

  it("pick_option compares against the exact option that was picked", () => {
    expect(needsReason("pick_option", "pick:1", "1")).toBe(false);
    expect(needsReason("pick_option", "pick:1", "0")).toBe(true);
  });

  it("'no longer relevant' needs a reason once a recommendation exists", () => {
    expect(needsReason("not_relevant", null)).toBe(false);
    expect(needsReason("not_relevant", "approve")).toBe(true);
  });
});

describe("verdict vocabulary (must match memory-rule.js verdictFor)", () => {
  it("maps each action onto the recommendation's words", () => {
    expect(verdictFor("approve")).toBe("approve");
    expect(verdictFor("edit_approve")).toBe("approve");
    expect(verdictFor("pick_option", "2")).toBe("pick:2");
    expect(verdictFor("own_answer")).toBe("answer");
    expect(verdictFor("snooze")).toBe("not_now");
    expect(verdictFor("keep_right")).toBe("keep_right");
    expect(verdictFor("new_answer")).toBe("new_answer");
  });

  it("actions with no recommendation equivalent return null", () => {
    expect(verdictFor("stage")).toBeNull();
    expect(verdictFor("flip")).toBeNull();
    expect(verdictFor("not_relevant")).toBeNull();
  });
});

describe("Omi provenance", () => {
  it("strips the date prefix", () => {
    expect(stripOmiPrefix("[Omi 2026-09-10] Stop paying the retainer"))
      .toBe("Stop paying the retainer");
  });

  it("strips the conflict prefix", () => {
    expect(stripOmiPrefix("CONFLICTS WITH #412 — Use a 24 hour window"))
      .toBe("Use a 24 hour window");
  });

  it("strips the possible-issue prefix", () => {
    expect(stripOmiPrefix("Possible issue heard in Omi — the dialer is idle"))
      .toBe("the dialer is idle");
  });

  it("strips two stacked prefixes", () => {
    expect(stripOmiPrefix("[Omi 2026-09-10] CONFLICTS WITH #412 — Use 24 hours"))
      .toBe("Use 24 hours");
  });

  it("leaves ordinary text alone", () => {
    expect(stripOmiPrefix("Pick a confirmation window")).toBe("Pick a confirmation window");
    expect(stripOmiPrefix(null)).toBe("");
  });

  it("recognises an Omi card by origin or by prefix", () => {
    expect(isOmi(card({ origin: "omi" }))).toBe(true);
    expect(isOmi(card({ origin: "live", description: "[Omi 2026-09-10] x" }))).toBe(true);
    expect(isOmi(card())).toBe(false);
  });

  it("the approve dialog prefills with the STRIPPED text, since that is what gets saved", () => {
    expect(prefillDecisionText(card({ description: "[Omi 2026-09-10] Cut the retainer" })))
      .toBe("Cut the retainer");
  });

  it("falls back to the recommended wording when the card has no description", () => {
    expect(prefillDecisionText(card({ description: "", rec_decision_text: "Keep 48 hours" })))
      .toBe("Keep 48 hours");
  });
});

describe("error handling", () => {
  it("the three 'someone else moved this' codes all trigger a reload", () => {
    for (const c of ["stale_card", "changed_since", "already_reversed"] as const) {
      expect(errorMessageFor(c).reload).toBe(true);
    }
  });

  it("a validation failure does not reload — the person just needs to add something", () => {
    expect(errorMessageFor("reason_required").reload).toBe(false);
    expect(errorMessageFor("proof_required").reload).toBe(false);
  });

  it("not_admin says so in plain words", () => {
    expect(errorMessageFor("not_admin").text).toMatch(/admin only/i);
    expect(errorMessageFor("not_admin").reload).toBe(false);
  });

  it("an unknown failure promises nothing was changed", () => {
    expect(errorMessageFor("error").text).toMatch(/Nothing was changed/);
  });
});
