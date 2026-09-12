import { describe, expect, it } from "vitest";
import {
  buttonsFor, suggestedButton, needsReason, verdictFor, stripOmiPrefix, isOmi,
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

/** Button ids, in order, for a card of this type. `rec` = the nightly has written an answer. */
const ids = (t: CardType, { options = null, rec = true }: { options?: string[] | null; rec?: boolean } = {}) =>
  buttonsFor({ card_type: t, options, rec_decision_text: rec ? "Keep 48 hours" : null }).map((b) => b.id);

/** The actions those buttons send, for pinning the vocabulary the server accepts. */
const actions = (t: CardType, { options = null, rec = true }: { options?: string[] | null; rec?: boolean } = {}) =>
  buttonsFor({ card_type: t, options, rec_decision_text: rec ? "Keep 48 hours" : null }).map((b) => b.action);

describe("card type → buttons", () => {
  it("every card type leads with approve, edit, reject — in that order", () => {
    for (const t of ["decision_needed", "open_question", "unconfirmed_decision"] as CardType[]) {
      expect(ids(t).slice(0, 3)).toEqual(["approve", "edit", "reject"]);
    }
    // An approval is a yes/no; there is no wording to edit.
    expect(ids("approval_needed")).toEqual(["approve", "reject", "snooze"]);
  });

  it("a question card approves the recommended answer and can edit it", () => {
    expect(actions("decision_needed")).toEqual([
      "own_answer", "own_answer", "reject", "snooze", "not_relevant",
    ]);
  });

  it("with options, Pick option sits behind the three", () => {
    expect(ids("decision_needed", { options: ["a", "b"] })).toEqual([
      "approve", "edit", "reject", "pick", "snooze", "not_relevant",
    ]);
  });

  it("without options there is no Pick option", () => {
    expect(ids("decision_needed")).not.toContain("pick");
  });

  it("an open question gets the same set as a decision needed", () => {
    expect(ids("open_question")).toEqual(ids("decision_needed"));
  });

  it("no recommendation yet: Approve drops off and Edit leads", () => {
    // There is nothing to approve until the nightly has written an answer, and
    // a card in that state must still be rulable rather than dead.
    const bs = buttonsFor({ card_type: "decision_needed", options: null, rec_decision_text: null });
    expect(bs.map((b) => b.id)).toEqual(["edit", "reject", "snooze", "not_relevant"]);
    expect(bs[0]?.label).toBe("Write my own answer");
    expect(bs[0]?.tone).toBe("primary");
  });

  it("an unconfirmed card is approve, edit, reject, not now", () => {
    expect(actions("unconfirmed_decision")).toEqual([
      "approve", "edit_approve", "reject", "snooze",
    ]);
  });

  it("an approval maps approve/reject onto yes/no", () => {
    expect(actions("approval_needed")).toEqual(["yes", "no", "snooze"]);
  });

  it("a conflict keeps its two sides rather than pretending to be an approval", () => {
    expect(ids("conflict")).toEqual(["keep_left", "keep_right", "edit", "not_a_conflict"]);
    expect(actions("conflict")).toEqual([
      "keep_left", "keep_right", "new_answer", "not_a_conflict",
    ]);
  });

  it("a conflict never offers snooze-as-not-relevant confusion", () => {
    // 'No longer relevant' on a conflict means 'not a conflict', so the plain
    // not_relevant button must not appear alongside it.
    expect(actions("conflict")).not.toContain("not_relevant");
  });

  it("every button that edits wording opens a dialog first", () => {
    for (const t of ["decision_needed", "open_question", "unconfirmed_decision", "conflict"] as CardType[]) {
      const edit = buttonsFor({ card_type: t, options: null, rec_decision_text: "x" })
        .find((b) => b.id === "edit");
      expect(edit?.opens).toBe("approve");
    }
  });

  it("only Approve carries the recommendation straight through", () => {
    for (const t of ["decision_needed", "unconfirmed_decision", "approval_needed"] as CardType[]) {
      const filled = buttonsFor({ card_type: t, options: null, rec_decision_text: "x" })
        .filter((b) => b.fillsFromRecommendation);
      expect(filled.map((b) => b.id)).toEqual(["approve"]);
    }
  });

  it("with nothing recommended, Approve never claims to fill from one", () => {
    const bs = buttonsFor({ card_type: "unconfirmed_decision", options: null, rec_decision_text: null });
    expect(bs.find((b) => b.id === "approve")?.fillsFromRecommendation).toBeFalsy();
  });
});

describe("which button the recommendation points at", () => {
  const marked = (over: Partial<QueueCard>) =>
    suggestedButton(card({ rec_at: "2026-09-11T00:00:00Z", rec_decision_text: "Keep 48 hours", ...over }));

  it("nothing is marked until the nightly has reached the card", () => {
    expect(suggestedButton(card())).toBeNull();
    expect(suggestedButton(card({ rec_verdict: "approve", rec_at: null }))).toBeNull();
    expect(suggestedButton(card({ rec_verdict: null, rec_at: "2026-09-11T00:00:00Z" }))).toBeNull();
  });

  it("an answered question marks Approve", () => {
    expect(marked({ card_type: "decision_needed", rec_verdict: "answer" })).toBe("approve");
    expect(marked({ card_type: "open_question", rec_verdict: "answer" })).toBe("approve");
  });

  it("with no recommended wording the mark falls to Edit, which is the only way in", () => {
    expect(marked({ card_type: "decision_needed", rec_verdict: "answer", rec_decision_text: null }))
      .toBe("edit");
  });

  it("approve / yes mark Approve, reject / no mark Reject", () => {
    expect(marked({ card_type: "unconfirmed_decision", rec_verdict: "approve" })).toBe("approve");
    expect(marked({ card_type: "approval_needed", rec_verdict: "yes" })).toBe("approve");
    expect(marked({ card_type: "unconfirmed_decision", rec_verdict: "reject" })).toBe("reject");
    expect(marked({ card_type: "approval_needed", rec_verdict: "no" })).toBe("reject");
  });

  it("a conflict marks the side the record supports", () => {
    expect(marked({ card_type: "conflict", rec_verdict: "keep_right" })).toBe("keep_right");
    expect(marked({ card_type: "conflict", rec_verdict: "not_a_conflict" })).toBe("not_a_conflict");
    expect(marked({ card_type: "conflict", rec_verdict: "new_answer" })).toBe("edit");
  });

  it("an option verdict marks Pick option, whichever option it named", () => {
    expect(marked({ card_type: "decision_needed", options: ["a", "b"], rec_verdict: "pick:1" })).toBe("pick");
    expect(marked({ card_type: "decision_needed", options: null, rec_verdict: "pick:1" })).toBeNull();
  });

  it("'not now' marks Not now where there is one", () => {
    expect(marked({ card_type: "decision_needed", rec_verdict: "not_now" })).toBe("snooze");
    // A conflict has no Not now, so nothing is marked rather than something wrong.
    expect(marked({ card_type: "conflict", rec_verdict: "not_now" })).toBeNull();
  });

  it("a verdict this card type has no button for marks nothing", () => {
    expect(marked({ card_type: "approval_needed", rec_verdict: "keep_left" })).toBeNull();
  });

  it("THE INVARIANT: the marked button never asks for a reason — unless it is a rejection", () => {
    // This is what makes "agreeing is one click" true. If it ever breaks, every
    // agreement costs a sentence and the queue stops being clearable.
    const verdicts = [
      "approve", "answer", "yes", "reject", "no",
      "keep_left", "keep_right", "not_a_conflict", "new_answer", "not_now", "pick:1",
    ];
    const types: CardType[] = [
      "decision_needed", "open_question", "unconfirmed_decision", "approval_needed", "conflict",
    ];
    for (const t of types) {
      for (const v of verdicts) {
        const c = card({
          card_type: t, options: ["a", "b"], rec_verdict: v,
          rec_at: "2026-09-11T00:00:00Z", rec_decision_text: "Keep 48 hours",
        });
        const id = suggestedButton(c);
        if (!id) continue;
        const b = buttonsFor(c).find((x) => x.id === id)!;
        const optionKey = b.id === "pick" ? v.slice("pick:".length) : undefined;
        const needs = needsReason(b.action, c.rec_verdict, optionKey);
        // reject / no are the deliberate exception: a rejection is always
        // explained, even when the AI asked for it too.
        expect(needs).toBe(b.action === "reject" || b.action === "no");
      }
    }
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

  it("prefills with the STRIPPED text, since that is what gets saved", () => {
    expect(prefillDecisionText(card({ description: "[Omi 2026-09-10] Cut the retainer" })))
      .toBe("Cut the retainer");
  });

  it("falls back to the card's own words when nothing was recommended", () => {
    expect(prefillDecisionText(card({ description: "Cut the retainer", rec_decision_text: null })))
      .toBe("Cut the retainer");
    expect(prefillDecisionText(card({ description: "", rec_decision_text: "Keep 48 hours" })))
      .toBe("Keep 48 hours");
  });

  it("THE RECOMMENDED ANSWER WINS over the description", () => {
    // On a question card the description is the QUESTION. Filing it would save
    // "what should the confirmation window be?" as the decision. This ordering
    // deliberately differs from decisionTextFor() in memory-rule.js, which is
    // why the page always sends text explicitly instead of letting the server
    // fall back.
    expect(prefillDecisionText(card({
      description: "What should the confirmation window be?",
      rec_decision_text: "Keep 48 hours",
    }))).toBe("Keep 48 hours");
  });

  it("whitespace is not an answer", () => {
    expect(prefillDecisionText(card({ description: "Cut the retainer", rec_decision_text: "   " })))
      .toBe("Cut the retainer");
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
