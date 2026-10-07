/**
 * "Every message" grouped by route (2026-10-07). A miniature of F.0's shape:
 * a "wait until … or give up" with an exit on the timeout side, then a
 * "has a rep name?" check whose yes side runs a 50/50 A/B test, and whose
 * paths jump back to a shared wait.
 */
import { describe, expect, it } from "vitest";
import { walkSchedule, type GraphStep, type WorkflowGraph } from "@/lib/journey/workflowGraph";
import { groupScheduleByRoute } from "./scheduleRoutes";
import { buildFlow } from "@/lib/journey/flowLayout";

function step(id: string, order: number, type: string, extra: Partial<GraphStep> = {}): GraphStep {
  return { id, order, type, name: extra.name ?? id, parent: null, nodeType: null, next: [], data: {}, templateId: null, branchCondition: null, disabled: false, ...extra };
}
const sms = (id: string, order: number, body: string, extra: Partial<GraphStep> = {}) => step(id, order, "sms", { name: id, data: { body }, ...extra });

const f0: WorkflowGraph = {
  workflowId: "f0",
  connections: [],
  templates: {},
  steps: [
    sms("intro", 1, "Thanks for meeting with us", { next: ["pause"] }),
    step("pause", 2, "wait", { name: "Pause?", data: { type: "condition", name: "Pause Workflow Active?", startAfter: { type: "days", value: 30 } }, next: ["happens", "timeout"] }),
    step("happens", 3, "transition", { name: "when", parent: "pause", data: { type: "wait_condition" }, next: ["ifrep"] }),
    step("timeout", 4, "transition", { name: "timeout", parent: "pause", data: { type: "wait_timeout" }, next: ["exit"] }),
    step("exit", 5, "remove_contact_tag", { data: { tags: ["active-f.0"] } }),
    step("ifrep", 6, "if_else", {
      name: "If: Check for Rep First Name",
      branchCondition: "Check for Rep First Name",
      nodeType: "condition-node",
      data: { branches: [{ id: "has", name: "Has Value", segments: [{ operator: "and", conditions: [{ conditionSubType: "REOrSe5b4Spk7w94z155", conditionOperator: "has_value" }] }] }] },
      next: ["has", "none"],
    }),
    step("has", 7, "if_else", { name: "Has Value", nodeType: "branch-yes", parent: "ifrep", next: ["sms3"] }),
    step("none", 8, "if_else", { name: "None", nodeType: "branch-no", parent: "ifrep", next: ["sms10"] }),
    sms("sms3", 9, "this is your rep from Reece", { next: ["split"] }),
    step("split", 10, "workflow_split", {
      name: "workflow.asideSection.headerMeta.workflowSplit",
      data: { paths: [{ id: "pa", name: "Path A" }, { id: "pb", name: "Path B" }], extras: { weightDistribution: { pa: 50, pb: 50 } } },
      next: ["pa", "pb"],
    }),
    step("pa", 11, "transition", { name: "Path A", parent: "split", next: ["sms4"] }),
    step("pb", 12, "transition", { name: "Path B", parent: "split", next: ["sms9"] }),
    sms("sms4", 13, "Path A copy", { next: ["wait1"] }),
    step("wait1", 14, "wait", { name: "wait", data: { type: "time", startAfter: { type: "days", value: 1 } }, next: ["sms5"] }),
    sms("sms5", 15, "after a day", { next: [] }),
    sms("sms9", 16, "Path B copy", { next: ["goto"] }),
    step("goto", 17, "goto", { data: { targetNodeId: "wait1" } }),
    sms("sms10", 18, "no rep name copy", { next: [] }),
  ],
};

describe("walkSchedule routes", () => {
  const walk = walkSchedule(f0);
  const route = (id: string) => walk.rows.find((r) => r.stepId === id)!.route.map((s) => `${s.decision} → ${s.answer}`);

  it("words every fork like the flowchart: event waits, if/else answers, A/B paths", () => {
    expect(route("intro")).toEqual([]);
    expect(route("sms3")).toEqual([
      "Wait until: Pause Workflow Active? → when it happens",
      "If: Check for Rep First Name → Has Value · a custom field is filled in",
    ]);
    expect(route("sms9")).toEqual([...route("sms3"), "A/B test (random split) → Path B · 50% of leads"]);
    expect(route("sms10")).toEqual([route("sms3")[0], "If: Check for Rep First Name → None · none of the above"]);
  });

  it("records a jump into a step another route already reached", () => {
    expect(walk.joins.map((j) => [j.route.at(-1)?.answer, j.atLabel])).toEqual([["Path B · 50% of leads", "Wait 1d"]]);
  });
});

describe("groupScheduleByRoute", () => {
  const walk = walkSchedule(f0);
  const { groups, shared } = groupScheduleByRoute(walk.rows, walk.joins);

  it("puts the shared start first, then one section per route in flowchart order", () => {
    expect(shared).toEqual([]);
    expect(groups.map((g) => [g.number, g.rows.map((r) => r.stepId)])).toEqual([
      [0, ["intro"]],
      [1, ["sms3"]],
      [2, ["sms4", "sms5"]],
      [3, ["sms9"]],
      [4, ["sms10"]],
    ]);
  });

  it("says where a route carries on when its messages are listed under another route", () => {
    const pathB = groups.find((g) => g.number === 3)!;
    expect(pathB.continues).toEqual([{ when: [], atLabel: "Wait 1d", routeNumbers: [2], loop: false }]);
  });

  // 2026-10-07: F.0's "pause … or give up after 30 days" ends the workflow on
  // its give-up side, so it is not a route — it made 18 routes out of F.0.
  it("only a fork with messages on two sides is a route", () => {
    const rep = groups.find((g) => g.number === 1)!;
    expect(rep.route.map((s) => s.decision)).toEqual(["If: Check for Rep First Name"]);
    expect(rep.splitsInto.map((x) => [x.number, x.via.answer])).toEqual([
      [2, "Path A · 50% of leads"],
      [3, "Path B · 50% of leads"],
    ]);
  });

  it("a deeper route shows only the forks after the route it branches off", () => {
    const pathA = groups.find((g) => g.number === 2)!;
    expect(pathA.after).toBe(1);
    expect(pathA.newSteps.map((s) => s.answer)).toEqual(["Path A · 50% of leads"]);
    expect(groups.find((g) => g.number === 1)!.after).toBeNull();
  });

  it("a one-sided check becomes a note on the message, worded so it reads on its own", () => {
    const guarded: WorkflowGraph = {
      ...f0,
      steps: f0.steps.map((st) =>
        st.id === "wait1"
          ? { ...st, next: ["hasEmail"] }
          : st,
      ).concat([
        step("hasEmail", 30, "if_else", {
          name: "If: Check for Email",
          branchCondition: "Check for Email",
          nodeType: "condition-node",
          data: { branches: [{ id: "ye", name: "Email Exist", segments: [{ operator: "and", conditions: [{ conditionSubType: "email", conditionOperator: "has_value" }] }] }] },
          next: ["ye", "ne"],
        }),
        step("ye", 31, "if_else", { name: "Email Exist", nodeType: "branch-yes", parent: "hasEmail", next: ["sms5"] }),
        step("ne", 32, "if_else", { name: "No Email", nodeType: "branch-no", parent: "hasEmail", next: [] }),
      ]),
    };
    const w = walkSchedule(guarded);
    const r = groupScheduleByRoute(w.rows, w.joins);
    expect(r.onlyIf.sms5).toEqual(["has email"]);
    expect(r.groups.find((g) => g.rows.some((x) => x.stepId === "sms5"))!.rows.map((x) => x.stepId)).toEqual(["sms4", "sms5"]);
  });

  it("a check asked again further down does not split the route again", () => {
    const ask = { decision: "If: Check for Rep First Name", answer: "Has Value", kind: "condition" as const };
    const row = (id: string, order: number, route: typeof ask[]) =>
      ({ ...walk.rows[0]!, stepId: id, walkOrder: order, route: route.map((s, i) => ({ ...s, forkId: `f${i}-${s.answer}`, pathId: `${s.answer}-${i}` })) });
    const other = { ...ask, answer: "No Name" };
    const rows = [row("a", 0, [ask]), row("b", 1, [ask, ask]), row("c", 2, [other])];
    // f0-Has Value / f0-No Name are different fork ids here, so give them one id:
    rows[2]!.route[0]!.forkId = rows[0]!.route[0]!.forkId;
    rows[1]!.route[0]!.forkId = rows[0]!.route[0]!.forkId;
    rows[1]!.route[1]!.forkId = "f1-other";
    rows.push({ ...row("d", 3, [ask, other]) });
    rows[3]!.route[0]!.forkId = rows[0]!.route[0]!.forkId;
    rows[3]!.route[1]!.forkId = "f1-other";
    const g = groupScheduleByRoute(rows, []);
    const ofA = g.groups.find((x) => x.rows.some((y) => y.stepId === "a"))!;
    expect(ofA.rows.map((y) => y.stepId)).toEqual(["a", "b"]);
  });

  it("a workflow with no forks is one plain group", () => {
    const flat: WorkflowGraph = { ...f0, steps: [sms("a", 1, "one", { next: ["b"] }), sms("b", 2, "two")] };
    const w = walkSchedule(flat);
    const r = groupScheduleByRoute(w.rows, w.joins);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.number).toBe(0);
  });
});

describe("flowchart names an A/B split in words, never GHL's UI key", () => {
  it("titles the split and labels its paths with their share", () => {
    const flow = buildFlow(f0);
    const titles = flow.nodes.map((n) => n.title);
    expect(titles).toContain("A/B test (random split)");
    expect(titles.some((t) => t.startsWith("workflow."))).toBe(false);
    expect(flow.edges.map((e) => e.label)).toContain("Path A · 50% of leads");
  });
});
