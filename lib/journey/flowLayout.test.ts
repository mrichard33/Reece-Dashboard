/**
 * The flowchart builder. Guards what the team asked for on 2026-09-24: every
 * branch drawn side by side with its condition in plain words, every message
 * on every path (not only the first), loops as "go to" chips instead of
 * tangled back-arrows, and nothing silently dropped.
 */
import { describe, expect, it } from "vitest";
import { buildFlow, describeBranch } from "./flowLayout";
import type { GraphStep, WorkflowGraph } from "./workflowGraph";

function step(id: string, order: number, type: string, extra: Partial<GraphStep> = {}): GraphStep {
  return { id, order, type, name: extra.name ?? id, parent: null, nodeType: null, next: [], data: {}, templateId: null, branchCondition: null, disabled: false, ...extra };
}

const S = (tag: string, op: "index-of-true" | "index-of-false") => ({
  segments: [{ operator: "and", conditions: [{ conditionSubType: "tags", conditionOperator: op, conditionValue: [tag] }] }],
});

// S2.1-shaped: a root decision whose BOTH sides send, a wait-until with a
// timeout, a loop back, a folded run of tag updates, a skipped step and one
// orphan step nothing points to.
const graph: WorkflowGraph = {
  workflowId: "wf",
  connections: [],
  templates: { tpl1: { name: "E1", subject: "Your calculator results", body: "<p>Hi</p>" } },
  steps: [
    step("root", 1, "if_else", {
      name: "Has email?",
      next: ["yes", "no"],
      data: { branches: [{ id: "yes", name: "Email Exist", segments: [{ operator: "and", conditions: [{ conditionSubType: "email", conditionOperator: "has_value" }] }] }] },
    }),
    step("yes", 2, "if_else", { name: "Email Exist", parent: "root", nodeType: "branch-yes", next: ["email1"] }),
    step("no", 3, "if_else", { name: "No Email", parent: "root", nodeType: "branch-no", next: ["sms1"] }),
    step("email1", 4, "email", { parent: "yes", templateId: "tpl1", next: ["tagA"], data: { from_name: "Randy Reece" } }),
    step("tagA", 5, "add_contact_tag", { parent: "yes", next: ["tagB"], data: { tags: ["sent:s2.1-e1"] } }),
    step("tagB", 6, "add_contact_tag", { parent: "yes", next: ["tagC"], data: { tags: ["calc-viewed"] } }),
    step("tagC", 7, "remove_contact_tag", { parent: "yes", next: ["tagD"], data: { tags: ["new"] } }),
    step("tagD", 8, "add_contact_tag", { parent: "yes", next: ["reply"], data: { tags: ["warm"] } }),
    step("reply", 9, "wait", {
      name: "wait",
      parent: "yes",
      next: ["t-ok", "t-timeout"],
      data: { type: "reply", name: "Customer replied", startAfter: { type: "days", value: 3 } },
    }),
    step("t-ok", 10, "transition", { name: "wait", parent: "reply", next: ["handoff"], data: { type: "wait_condition" } }),
    step("t-timeout", 11, "transition", { name: "timeout", parent: "reply", next: ["loop"], data: { type: "wait_timeout" } }),
    step("handoff", 12, "add_to_workflow", { parent: "yes", data: { workflow_id: "wf-s3" } }),
    step("loop", 13, "goto", { parent: "yes", data: { targetNodeId: "email1" } }),
    step("sms1", 14, "sms", { parent: "no", next: ["off"], data: { body: "Your window estimate is ready — want it?" } }),
    step("off", 15, "webhook", { parent: "no", data: { url: "https://example.com/hook", skipAction: true }, disabled: true }),
    step("orphan", 16, "sms", { data: { body: "Never sent" } }),
  ],
};

const flow = buildFlow(graph, (id) => (id === "wf-s3" ? "S3.1 Positioning" : id));
const byTitle = (t: string) => flow.nodes.filter((n) => n.title === t);

describe("buildFlow", () => {
  it("draws both sides of a decision, side by side, labelled in plain words", () => {
    const cond = flow.nodes.find((n) => n.kind === "condition")!;
    const out = flow.edges.filter((e) => e.from === cond.id);
    expect(out.map((e) => e.label)).toEqual(["Email Exist · has email", "No Email · none of the above"]);
    const [a, b] = out.map((e) => flow.nodes.find((n) => n.id === e.to)!);
    expect(a!.y).toBe(b!.y);
    expect(a!.x + a!.w).toBeLessThanOrEqual(b!.x);
  });

  it("keeps the main path in a straight line down the left", () => {
    const cond = flow.nodes.find((n) => n.kind === "condition")!;
    const first = flow.nodes.find((n) => n.id === flow.edges.find((e) => e.from === cond.id)!.to)!;
    expect(first.x).toBe(cond.x);
    expect(flow.nodes.every((n) => n.x >= 0 && n.x + n.w <= flow.width)).toBe(true);
  });

  it("shows every message on every path, not just the first", () => {
    const msgs = flow.nodes.filter((n) => n.kind === "message").map((n) => `${n.title}|${n.lines[0]}`);
    expect(msgs).toEqual(expect.arrayContaining(["Email 1|Your calculator results", "SMS 1|Your window estimate is ready — want it?"]));
  });

  it("gives a wait-until two labelled exits", () => {
    const wait = flow.nodes.find((n) => n.kind === "wait")!;
    expect(wait.title).toBe("Wait until: Customer replied");
    expect(flow.edges.filter((e) => e.from === wait.id).map((e) => e.label)).toEqual(["when it happens", "if not within 3d"]);
  });

  it("draws a loop as a go-to chip, never a second copy of the step", () => {
    expect(byTitle("↪ go to: email1")).toHaveLength(1);
    expect(flow.nodes.filter((n) => n.stepId === "email1")).toHaveLength(1);
  });

  it("folds a run of tag updates into one box but keeps every update in the details", () => {
    const box = byTitle("4 updates")[0]!;
    expect(box.lines).toHaveLength(3);
    expect(box.detail?.text?.split("\n")).toHaveLength(4);
  });

  it("names the target workflow and marks a step that is turned off", () => {
    expect(flow.nodes.find((n) => n.kind === "workflow")!.lines).toEqual(["S3.1 Positioning"]);
    expect(flow.nodes.find((n) => n.kind === "webhook")!.skipped).toBe(true);
  });

  it("lists steps the start can never reach instead of hiding them", () => {
    expect(flow.unreachable.map((u) => u.stepId)).toEqual(["orphan"]);
    expect(flow.stats).toMatchObject({ messages: 3, conditions: 1, waits: 1 });
  });
});

describe("describeBranch", () => {
  it("reads tag conditions as sentences", () => {
    expect(describeBranch(S("sent:s2.2-e1", "index-of-true"))).toBe("has tag sent:s2.2-e1");
    expect(describeBranch(S("pause-workflow", "index-of-false"))).toBe("does not have tag pause-workflow");
    expect(describeBranch(undefined)).toBe("");
  });
});
