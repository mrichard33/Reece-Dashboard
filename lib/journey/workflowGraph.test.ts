/**
 * The step graph → schedule. Guards the three things live data taught us:
 * delay_minutes is not minutes (startAfter is), "first branch" is not a
 * schedule (S2.2's first branch exits), and the workflow's own sent:* stamp
 * is the send number a contact's tag refers to.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateBranch,
  formatMinutes,
  type GraphStep,
  isStepDisabled,
  linearizeSchedule,
  logicTree,
  parseStartAfter,
  toGraphStep,
  walkSchedule,
  type WorkflowGraph,
} from "./workflowGraph";

describe("parseStartAfter", () => {
  it("reads hours and days, singular or plural (spec verification #1)", () => {
    expect(parseStartAfter({ type: "hour", value: 1 })).toEqual({ minutes: 60, unparsed: false });
    expect(parseStartAfter({ type: "day", value: 30 })).toEqual({ minutes: 43200, unparsed: false });
    expect(parseStartAfter({ type: "days", when: "after", value: 30 }).minutes).toBe(43200);
    expect(parseStartAfter({ type: "minutes", value: 0.5 }).minutes).toBe(1);
    expect(parseStartAfter({ type: "weeks", value: 2 }).minutes).toBe(20160);
  });

  it("reads it from the whole raw_json or a step's data, never delay_minutes", () => {
    const rawJson = { raw: { data: { startAfter: { type: "hour", value: 24 } } }, delay_minutes: 24 };
    expect(parseStartAfter(rawJson).minutes).toBe(1440);
    expect(parseStartAfter({ startAfter: { type: "hour", value: 1 } }).minutes).toBe(60);
  });

  it("flags units it cannot read instead of guessing", () => {
    expect(parseStartAfter({ type: "fortnight", value: 1 })).toEqual({ minutes: 0, unparsed: true });
    expect(parseStartAfter({})).toEqual({ minutes: 0, unparsed: true });
  });

  it("formats compactly", () => {
    expect(formatMinutes(1500)).toBe("1d 1h");
    expect(formatMinutes(65)).toBe("1h 5m");
    expect(formatMinutes(0)).toBe("0m");
  });
});

// A miniature of S2.2's real shape: a root if/else whose FIRST branch exits,
// an else branch with waits, a condition wait with a 30-day timeout, an email
// stamped `sent:s2.2-e1`, then a tag-checked SMS.
function step(id: string, order: number, type: string, extra: Partial<GraphStep> = {}): GraphStep {
  return { id, order, type, name: extra.name ?? id, parent: null, nodeType: null, next: [], data: {}, templateId: null, branchCondition: null, disabled: false, ...extra };
}

const S = (tag: string, op: "index-of-true" | "index-of-false") => ({
  segments: [{ operator: "and", conditions: [{ conditionSubType: "tags", conditionOperator: op, conditionValue: [tag] }] }],
});

const graph: WorkflowGraph = {
  workflowId: "wf",
  connections: [],
  templates: { tpl1: { name: "E1", subject: "The part of hurricane protection nobody talks about", body: "<p>Hello</p>" } },
  steps: [
    step("root", 1, "if_else", {
      name: "Check if Indoctrination Started",
      next: ["active", "notActive"],
      data: { branches: [{ id: "active", name: "Indoctrination Active", ...S("indoctrination-complete", "index-of-true") }] },
    }),
    step("active", 2, "if_else", { name: "Indoctrination Active", parent: "root", nodeType: "branch-yes" }),
    step("notActive", 3, "if_else", { name: "Not Active", parent: "root", nodeType: "branch-no", next: ["w1"] }),
    step("w1", 4, "wait", { parent: "notActive", next: ["w24"], data: { type: "time", startAfter: { type: "hour", value: 1 } } }),
    step("w24", 5, "wait", { parent: "notActive", next: ["pause"], data: { type: "time", startAfter: { type: "hour", value: 24 } } }),
    step("pause", 6, "wait", {
      name: "wait",
      parent: "notActive",
      next: ["t-cond", "t-timeout"],
      data: { type: "condition", name: "Pause Workflow Active?", startAfter: { type: "days", value: 30 }, condition: { branches: [S("pause-workflow", "index-of-false")] } },
    }),
    step("t-cond", 7, "transition", { name: "wait", parent: "pause", next: ["email1"], data: { type: "wait_condition" } }),
    step("t-timeout", 8, "transition", { name: "timeout", parent: "pause", next: [], data: { type: "wait_timeout" } }),
    step("email1", 9, "email", { parent: "notActive", templateId: "tpl1", next: ["stamp1"], data: { from_name: "Randy Reece" } }),
    step("stamp1", 10, "add_contact_tag", { parent: "notActive", next: ["w5m"], data: { tags: ["sent:s2.2-e1"] } }),
    step("w5m", 11, "wait", { parent: "notActive", next: ["sentCheck"], data: { type: "time", startAfter: { type: "minutes", value: 5 } } }),
    step("sentCheck", 12, "if_else", {
      name: "Check SMS",
      next: ["notSent", "sent"],
      data: { branches: [{ id: "notSent", name: "Not Sent (Continue)", ...S("sent:s2.2-s1", "index-of-false") }] },
    }),
    step("notSent", 13, "if_else", { name: "Not Sent (Continue)", parent: "sentCheck", nodeType: "branch-yes", next: ["sms1"] }),
    step("sent", 14, "if_else", { name: "Already sent", parent: "sentCheck", nodeType: "branch-no" }),
    step("sms1", 15, "sms", { parent: "notSent", next: ["loop"], data: { body: "Quick question about your windows?" } }),
    step("loop", 16, "goto", { parent: "notSent", data: { targetNodeId: "w24" } }),
  ],
};

describe("linearizeSchedule", () => {
  it("finds sends past a first branch that exits (S2.2's shape)", () => {
    const rows = linearizeSchedule(graph);
    expect(rows.map((r) => `${r.type}${r.n}`)).toEqual(["email1", "sms1"]);
    const e1 = rows[0]!;
    expect(e1.offsetMinutes).toBe(25 * 60); // +1h then +24h — spec verification #6
    expect(e1.day).toBe(1);
    expect(e1.subject).toBe("The part of hurricane protection nobody talks about");
    expect(e1.from).toBe("Randy Reece");
    expect(e1.branchPath).toEqual(["Not Active"]);
    expect(rows[1]!.offsetMinutes).toBe(25 * 60 + 5);
  });

  it("survives a goto loop and never reads delay_minutes", () => {
    const rows = linearizeSchedule(graph);
    expect(rows).toHaveLength(2); // the goto back to w24 is followed once, not forever
  });

  it("numbers from the workflow's own sent:* stamp over encounter order", () => {
    const g: WorkflowGraph = {
      ...graph,
      steps: graph.steps.map((s) => (s.id === "stamp1" ? { ...s, data: { tags: ["sent:s2.2-e4"] } } : s)),
    };
    expect(linearizeSchedule(g)[0]!.n).toBe(4);
  });
});

describe("walkSchedule for one contact", () => {
  it("evaluates tag branches and condition waits", () => {
    const fresh = walkSchedule(graph, { facts: { tags: [] }, maxMessages: 5 });
    expect(fresh.rows.map((r) => `${r.type}${r.n}`)).toEqual(["email1", "sms1"]);
    expect(fresh.dependsOn).toEqual([]);

    const done = walkSchedule(graph, { facts: { tags: ["indoctrination-complete"] } });
    expect(done.rows).toEqual([]);

    // Paused: the condition wait falls through to its 30-day timeout, which
    // leads nowhere — so nothing is projected rather than a wrong date.
    const paused = walkSchedule(graph, { facts: { tags: ["pause-workflow"] } });
    expect(paused.rows).toEqual([]);

    const smsDone = walkSchedule(graph, { facts: { tags: ["sent:s2.2-s1"] } });
    expect(smsDone.rows.map((r) => r.type)).toEqual(["email"]);
  });

  it("walks from a start step, skipping it", () => {
    const r = walkSchedule(graph, { startId: "email1", skipStart: true, facts: { tags: [] } });
    expect(r.rows.map((x) => [x.type, x.offsetMinutes])).toEqual([["sms", 5]]);
  });

  it("marks what it could not evaluate", () => {
    const g: WorkflowGraph = {
      ...graph,
      steps: graph.steps.map((s) =>
        s.id === "root"
          ? { ...s, data: { branches: [{ id: "active", name: "Stage is 3", segments: [{ conditions: [{ conditionSubType: "abc", conditionOperator: "==" }] }] }] } }
          : s,
      ),
    };
    const r = walkSchedule(g, { facts: { tags: [] } });
    expect(r.dependsOn).toEqual(["Indoctrination Active"]);
    expect(r.rows).toEqual([]); // took the unknown first branch, which exits
  });
});

describe("evaluateBranch", () => {
  it("handles and/or and unknowns", () => {
    expect(evaluateBranch(S("x", "index-of-true"), { tags: ["x"] })).toBe(true);
    expect(evaluateBranch(S("x", "index-of-false"), { tags: ["x"] })).toBe(false);
    const email = { segments: [{ conditions: [{ conditionSubType: "email", conditionOperator: "has_value" }] }] };
    expect(evaluateBranch(email, { tags: [], hasEmail: false })).toBe(false);
    expect(evaluateBranch(email, { tags: [] })).toBeNull();
  });
});

describe("toGraphStep / logicTree", () => {
  it("reads raw_json.raw and array next", () => {
    const s = toGraphStep({
      step_id: "a",
      step_order: 3,
      step_type: "wait",
      template_id: null,
      branch_condition: null,
      raw_json: { raw: { name: "wait", next: ["b", "c"], parent: "p", data: { type: "condition" } } },
    });
    expect(s).toMatchObject({ id: "a", order: 3, next: ["b", "c"], parent: "p", data: { type: "condition" } });
  });

  // 2026-09-25: GHL keeps its "turn off this action" switch in
  // advanceCanvasMeta.isDisabled; data.skipAction was never set on a live step.
  it("reads GHL's turn-off switch from advanceCanvasMeta, and the older skipAction", () => {
    expect(isStepDisabled({ advanceCanvasMeta: { isDisabled: true }, data: {} })).toBe(true);
    expect(isStepDisabled({ data: { skipAction: true } })).toBe(true);
    expect(isStepDisabled({ advanceCanvasMeta: { isDisabled: false }, data: {} })).toBe(false);
    expect(isStepDisabled({})).toBe(false);
    const s = toGraphStep({ step_id: "x", step_order: 1, step_type: "sms", template_id: null, branch_condition: null, raw_json: { raw: { advanceCanvasMeta: { isDisabled: true } } } });
    expect(s.disabled).toBe(true);
  });

  it("leaves a turned-off message out of a contact's projected schedule", () => {
    const g: WorkflowGraph = { ...graph, steps: graph.steps.map((s) => (s.id === "email1" ? { ...s, disabled: true } : s)) };
    const r = walkSchedule(g, { facts: { tags: [] }, maxMessages: 5 });
    expect(r.rows.map((x) => x.type)).toEqual(["sms"]);
  });

  it("indents by enclosing branch and names things plainly", () => {
    const lines = logicTree(graph);
    const byId = Object.fromEntries(lines.map((l) => [l.id, l]));
    expect(byId.root!.text).toBe("If / else: Check if Indoctrination Started");
    expect(byId.notActive!.text).toBe("↳ Not Active (else)");
    expect(byId.notActive!.depth).toBe(1);
    expect(byId.w1!.depth).toBe(2);
    expect(byId.w1!.text).toBe("Wait 1h");
    expect(byId.stamp1!.text).toBe("Add tags: sent:s2.2-e1");
    expect(byId.loop!.text).toBe("Go to: w24");
  });
});
