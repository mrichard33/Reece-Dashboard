/**
 * Projection is the one clever part (spec §B6), so it carries the most
 * explicit guarantees: rows are always `projected`, never dated in the past,
 * silent when automation is stopped, and counted from the moment the last
 * send's tag first appeared — not from "now".
 */
import { describe, expect, it } from "vitest";
import { projectionAnchor, projectNext, tagRunStart } from "./projection";
import type { GraphStep, WorkflowGraph } from "./workflowGraph";

function step(id: string, order: number, type: string, extra: Partial<GraphStep> = {}): GraphStep {
  return { id, order, type, name: extra.name ?? id, parent: null, nodeType: null, next: [], data: {}, templateId: null, branchCondition: null, disabled: false, ...extra };
}
const hours = (h: number) => ({ type: "time", startAfter: { type: "hour", value: h } });

// Entry → wait 1h → SMS 1 (stamped s1) → wait 24h → Email 1 (stamped e1) → wait 24h → SMS 2 (stamped s2)
const graph: WorkflowGraph = {
  workflowId: "e4",
  connections: [],
  templates: {},
  steps: [
    step("w1", 1, "wait", { next: ["sms1"], data: hours(1) }),
    step("sms1", 2, "sms", { next: ["t1"], data: { body: "Quick question about your windows?" } }),
    step("t1", 3, "add_contact_tag", { next: ["w2"], data: { tags: ["sent:e.4-s1"] } }),
    step("w2", 4, "wait", { next: ["email1"], data: hours(24) }),
    step("email1", 5, "email", { next: ["t2"], data: { subject: "The part of hurricane protection nobody talks about", from_name: "Randy Reece" } }),
    step("t2", 6, "add_contact_tag", { next: ["w3"], data: { tags: ["sent:e.4-e1"] } }),
    step("w3", 7, "wait", { next: ["sms2"], data: hours(24) }),
    step("sms2", 8, "sms", { next: ["t3"], data: { body: "{{chatgpt.12.response}}" } }),
    step("t3", 9, "add_contact_tag", { data: { tags: ["sent:e.4-s2"] } }),
  ],
};

const snaps = [
  { ts: "2026-09-24T12:00:00.000Z", tags: ["active-e.4"] },
  { ts: "2026-09-24T13:00:00.000Z", tags: ["active-e.4", "sent:e.4-s1"] },
  { ts: "2026-09-25T13:00:00.000Z", tags: ["active-e.4", "sent:e.4-s1", "sent:e.4-e1"] },
];

describe("tagRunStart", () => {
  it("finds the start of the CURRENT run, not the first ever", () => {
    const history = [
      { ts: "2026-09-01T00:00:00Z", tags: ["active-e.4"] },
      { ts: "2026-09-02T00:00:00Z", tags: [] },
      { ts: "2026-09-10T00:00:00Z", tags: ["active-e.4"] },
      { ts: "2026-09-11T00:00:00Z", tags: ["active-e.4", "x"] },
    ];
    expect(tagRunStart(history, "active-e.4")).toBe("2026-09-10T00:00:00Z");
    expect(tagRunStart(history, "x")).toBe("2026-09-11T00:00:00Z");
    expect(tagRunStart([...history, { ts: "2026-09-12T00:00:00Z", tags: [] }], "active-e.4")).toBeNull();
  });
});

describe("projectionAnchor", () => {
  it("anchors on the latest send tag's first appearance", () => {
    expect(projectionAnchor(snaps[2]!.tags, snaps, ["E.4"])).toEqual({ tag: "sent:e.4-e1", ts: "2026-09-25T13:00:00.000Z" });
  });
  it("falls back to the workflow entry when nothing has sent", () => {
    expect(projectionAnchor(["active-e.4"], snaps.slice(0, 1), ["E.4"])).toEqual({ tag: null, ts: "2026-09-24T12:00:00.000Z" });
  });
});

describe("projectNext", () => {
  const base = { code: "E.4", codes: ["E.4"], graph };

  it("projects the next sends from the last send, labelled projected", () => {
    const tags = snaps[2]!.tags;
    const out = projectNext({ ...base, tags, anchor: projectionAnchor(tags, snaps, ["E.4"]), now: new Date("2026-09-25T14:00:00Z") });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      ts: "2026-09-26T13:00:00.000Z", // e1 at 13:00 + 24h
      lane: "message",
      kind: "sms_out_projected",
      projected: true,
      title: "SMS 2 of E.4 (written at send time)",
    });
  });

  it("projects from entry when nothing has sent yet", () => {
    const out = projectNext({ ...base, tags: ["active-e.4"], anchor: { tag: null, ts: "2026-09-24T12:00:00.000Z" }, now: new Date("2026-09-24T12:10:00Z") });
    expect(out.map((e) => [e.title, e.ts])).toEqual([
      ['SMS 1 of E.4 — "Quick question about your windows?"', "2026-09-24T13:00:00.000Z"],
      ['Email 1 of E.4 — "The part of hurricane protection nobody talks about"', "2026-09-25T13:00:00.000Z"],
      ["SMS 2 of E.4 (written at send time)", "2026-09-26T13:00:00.000Z"],
    ]);
  });

  it("never dates a projection in the past", () => {
    const out = projectNext({ ...base, tags: ["active-e.4"], anchor: { tag: null, ts: "2026-09-24T12:00:00.000Z" }, now: new Date("2026-09-25T20:00:00Z") });
    expect(out.map((e) => e.title)).toEqual(["SMS 2 of E.4 (written at send time)"]);
    for (const e of out) expect(Date.parse(e.ts)).toBeGreaterThan(Date.parse("2026-09-25T20:00:00Z"));
  });

  it("after an SMS-only STOP (dnc-sms) projects the emails, never the texts", () => {
    const out = projectNext({ ...base, tags: ["active-e.4", "dnc-sms"], anchor: { tag: null, ts: "2026-09-24T12:00:00.000Z" }, now: new Date("2026-09-24T12:10:00Z") });
    expect(out.map((e) => e.title)).toEqual(['Email 1 of E.4 — "The part of hurricane protection nobody talks about"']);
  });

  it("projects nothing when automation is stopped or paused", () => {
    for (const t of ["stop-bot", "dnc", "cooling-active"]) {
      const out = projectNext({ ...base, tags: ["active-e.4", t], anchor: { tag: null, ts: "2026-09-24T12:00:00.000Z" }, now: new Date("2026-09-24T12:10:00Z") });
      expect(out).toEqual([]);
    }
  });

  it("projects nothing without an anchor or when the last send is not in the graph", () => {
    expect(projectNext({ ...base, tags: ["active-e.4"], anchor: null, now: new Date() })).toEqual([]);
    expect(projectNext({ ...base, tags: ["active-e.4", "sent:e.4-e9"], anchor: { tag: "sent:e.4-e9", ts: "2026-09-24T12:00:00Z" }, now: new Date("2026-09-24T12:10:00Z") })).toEqual([]);
  });
});
