import { describe, expect, it } from "vitest";
import { buildGroups, canApply, toApplyInput, proofFrom } from "./batch";
import { BATCH_MAX, type QueueCard } from "./rules";

/**
 * The batch pass is the one button on this page that can change fifty rows, so
 * these tests are about what it REFUSES as much as what it does.
 *
 * claude_rule_batch enforces every one of these again on the server — that is
 * the real gate, and none of this is a security boundary. What these pin is
 * that the page agrees with it, so a refusal arrives before someone has checked
 * fifty boxes rather than after.
 */

const issue = (over: Partial<QueueCard> = {}): QueueCard =>
  ({
    lane: "stale", card_type: "stale_issue",
    source_table: "claude_known_issues", source_id: 1,
    description: "MOD report is missing the CCC dispositions",
    options: null, origin: "live", area: "scorecard-reporting",
    created_at: "2026-06-01T00:00:00Z", age_days: 105,
    rec_verdict: "still_broken", rec_reason: "Nothing shows it was fixed.",
    rec_evidence: null, rec_confidence: "high", rec_risk: "none",
    rec_decision_text: null, rec_category: null, rec_build_text: null,
    rec_at: "2026-09-14T00:00:00Z",
    left_id: null, left_text: null, left_origin: null, left_confidence: null,
    left_date: null, left_status: null, left_rollout_stage: null,
    right_id: null, right_text: null, right_origin: null, right_confidence: null,
    right_date: null, right_status: null, right_rollout_stage: null,
    conflict_kind: null, similarity: null, blocks_count: 0, card_version: "v1",
    rec_group_key: "still_broken:no-evidence-of-fix",
    omi_action_item_id: null, item_type_norm: null,
    ...over,
  }) as QueueCard;

const todo = (over: Partial<QueueCard> = {}): QueueCard =>
  issue({
    lane: "todos", card_type: "todo", source_table: "claude_pending_items",
    rec_verdict: "keep", rec_group_key: "keep:no-evidence", item_type_norm: "action_needed",
    ...over,
  });

const pr = (ref: string) => [{ type: "pr" as const, ref, note: "merged" }];

/** The first group, asserted to exist — a test that got none should fail loudly. */
function firstGroup(cards: QueueCard[], lane: "stale" | "todos") {
  const [g] = buildGroups(cards, lane);
  if (!g) throw new Error("expected at least one group");
  return g;
}

describe("what gets into a group", () => {
  it("groups high-confidence cards by the reason they share", () => {
    const groups = buildGroups(
      [issue({ source_id: 1 }), issue({ source_id: 2 }), issue({ source_id: 3, rec_group_key: "no_longer_matters:system-retired", rec_verdict: "no_longer_matters" })],
      "stale",
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.total).toBe(2);
    expect(groups[0]!.label).toBe("Nothing shows these were ever fixed");
  });

  it("leaves medium and low confidence out entirely", () => {
    // Not hidden — they are still on the one-at-a-time list below. A batch is
    // the recommendation acting on its own word, and "medium" means it is not
    // sure, which is exactly the work a person should look at.
    const groups = buildGroups(
      [issue({ source_id: 1, rec_confidence: "medium" }), issue({ source_id: 2, rec_confidence: "low" }), issue({ source_id: 3, rec_confidence: null })],
      "stale",
    );
    expect(groups).toHaveLength(0);
  });

  it("leaves out a verdict that belongs to another lane", () => {
    const groups = buildGroups([issue({ rec_verdict: "approve" }), issue({ source_id: 2, rec_verdict: "done" })], "stale");
    expect(groups).toHaveLength(0);
  });

  it("leaves out a card whose verdict does not match its table", () => {
    // A `done` on claude_known_issues would be refused by the SQL; it must not
    // reach a checkbox in the first place.
    const groups = buildGroups([todo({ source_table: "claude_known_issues", rec_verdict: "done" })], "todos");
    expect(groups).toHaveLength(0);
  });

  it("drops a fixed card that has no proof, rather than offering a box that cannot be applied", () => {
    const withProof = issue({ source_id: 1, rec_verdict: "fixed", rec_group_key: "fixed:pr-merged", rec_evidence: pr("#900") });
    const without = issue({ source_id: 2, rec_verdict: "fixed", rec_group_key: "fixed:pr-merged", rec_evidence: null });
    const g = firstGroup([withProof, without], "stale");
    expect(g.items.map((i) => i.source_id)).toEqual([1]);
  });

  it("never groups anything on the Rulings lane", () => {
    expect(buildGroups([issue({ lane: "rulings" })], "rulings")).toHaveLength(0);
  });

  it("caps a group at 50 but says how many there really are", () => {
    const many = Array.from({ length: 63 }, (_, i) => issue({ source_id: i + 1 }));
    const g = firstGroup(many, "stale");
    expect(g.items).toHaveLength(BATCH_MAX);
    expect(g.total).toBe(63);
    expect(g.capped).toBe(true);
  });

  it("puts the biggest group first — the most work cleared per read", () => {
    const groups = buildGroups(
      [
        issue({ source_id: 1, rec_group_key: "no_longer_matters:superseded", rec_verdict: "no_longer_matters" }),
        issue({ source_id: 2 }), issue({ source_id: 3 }), issue({ source_id: 4 }),
      ],
      "stale",
    );
    expect(groups[0]!.total).toBe(3);
  });

  it("keeps ungrouped high-confidence cards together rather than losing them", () => {
    const g = firstGroup([issue({ rec_group_key: null })], "stale");
    expect(g.key).toBe("still_broken:ungrouped");
    expect(g.label).toBe("still_broken:ungrouped");
  });
});

describe("picking the proof", () => {
  it("prefers a merged PR over a bare query", () => {
    expect(proofFrom({ rec_evidence: [
      { type: "query", ref: "select ...", note: "" },
      { type: "pr", ref: "#900", note: "merged" },
    ] })).toBe("#900");
  });

  it("returns null when there is nothing to cite", () => {
    expect(proofFrom({ rec_evidence: null })).toBeNull();
    expect(proofFrom({ rec_evidence: [{ type: "pr", ref: "  ", note: "" }] })).toBeNull();
  });
});

describe("what a pass refuses, and what it says", () => {
  const group = firstGroup(Array.from({ length: 5 }, (_, i) => issue({ source_id: i + 1 })), "stale");

  it("refuses nothing checked", () => {
    const g = canApply(group, []);
    expect(g.ok).toBe(false);
    expect(g.ok === false && g.reason).toMatch(/Nothing checked/);
  });

  it("refuses more than 50, and says how many to uncheck", () => {
    const g = canApply(group, Array.from({ length: 51 }, (_, i) => i + 1));
    expect(g.ok).toBe(false);
    expect(g.ok === false && g.reason).toMatch(/Uncheck 1/);
  });

  it("allows exactly 50", () => {
    expect(canApply(group, Array.from({ length: BATCH_MAX }, (_, i) => i + 1)).ok).toBe(true);
  });

  it("refuses a fixed pass where any checked card has no proof", () => {
    const g = firstGroup([
      issue({ source_id: 1, rec_verdict: "fixed", rec_group_key: "fixed:pr-merged", rec_evidence: pr("#900") }),
    ], "stale");
    // Force the unproved case: a card that got in and then lost its proof is
    // exactly the state the SQL would reject, so the button must too.
    const tampered = { ...g, items: [{ ...g.items[0]!, proof: null }] };
    const res = canApply(tampered, [1]);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toMatch(/worse than leaving it open/);
  });

  it("counts what is actually checked, not what is in the group", () => {
    expect(canApply(group, [1, 2]).count).toBe(2);
  });
});

describe("the payload that gets sent", () => {
  const group = firstGroup([
    issue({ source_id: 7, rec_verdict: "fixed", rec_group_key: "fixed:pr-merged", rec_evidence: pr("#900"), card_version: "v7" }),
    issue({ source_id: 8, rec_verdict: "fixed", rec_group_key: "fixed:pr-merged", rec_evidence: pr("#901"), card_version: "v8" }),
  ], "stale");

  it("sends only the checked cards", () => {
    expect(toApplyInput(group, [7]).targets.map((t) => t.id)).toEqual([7]);
  });

  it("carries each card's own version so a moved card drops the whole pass", () => {
    const input = toApplyInput(group, [7, 8]);
    expect(input.targets.map((t) => t.card_version)).toEqual(["v7", "v8"]);
  });

  it("carries each card's own proof rather than one line covering fifty issues", () => {
    const input = toApplyInput(group, [7, 8]);
    expect(input.targets.map((t) => t.proof)).toEqual(["#900", "#901"]);
  });

  it("names the group it came from, so the history says why", () => {
    expect(toApplyInput(group, [7]).rec_group_key).toBe("fixed:pr-merged");
    expect(toApplyInput(group, [7]).verdict).toBe("fixed");
    expect(toApplyInput(group, [7]).action).toBe("batch_apply");
  });

  it("passes an assignee through when there is one", () => {
    const todos = firstGroup([todo({ source_id: 3, rec_verdict: "assign", rec_group_key: "assign:owner-named" })], "todos");
    expect(toApplyInput(todos, [3], { assignee: "Amanda" }).assignee).toBe("Amanda");
  });
});
