/**
 * The "is it sending" logic. The rule under test: `silent` is earned by a
 * measurement that saw nothing, never by a measurement that could not be made.
 */
import { describe, expect, it } from "vitest";
import { entries, fingerprint, matchStepSends, stampSends, stampTotal, summarizeWorkflow, type OutboundHead, type SendActivityRaw, type StepHead } from "./sendActivity";

const raw = (over: Partial<Extract<SendActivityRaw, { ok: true }>> = {}): SendActivityRaw => ({
  ok: true,
  computedAt: "2026-09-25T03:24:52Z",
  days: 30,
  tags: [],
  heads: [],
  stepHeads: [],
  ...over,
});

describe("fingerprint", () => {
  it("lets a merge field be anything and anchors at the start", () => {
    const re = fingerprint("Hey {{contact.first_name}}, this is {{custom_values.rep_name}} from Reece Windows & Doors.")!;
    expect(re.test("hey scott, this is mark from reece windows & doors. quick one:")).toBe(true);
    expect(re.test("scott, hey this is mark from reece windows & doors.")).toBe(false);
  });
  it("refuses text that cannot identify a message", () => {
    expect(fingerprint("{{chatgpt.25.response}}")).toBeNull();
    expect(fingerprint("Hi {{contact.first_name}}, thanks!")).toBeNull();
    expect(fingerprint("")).toBeNull();
  });
});

describe("matchStepSends", () => {
  const heads: OutboundHead[] = [
    { type: "2", head: "hey scott, this is mark from reece windows & doors. quick question", sends: 40, contacts: 38 },
    { type: "2", head: "hey ana, this is dana from reece windows & doors. quick question", sends: 5, contacts: 5 },
    { type: "3", head: "the checklist florida families wish they'd had before the last storm. the checklist", sends: 300, contacts: 290 },
  ];
  const steps: StepHead[] = [
    { workflow_id: "w1", step_id: "sms1", step_type: "sms", head: "hey {{contact.first_name}}, this is {{custom_values.rep_name}} from reece windows & doors. quick question" },
    { workflow_id: "w1", step_id: "ai1", step_type: "sms", head: "{{chatgpt.25.response}}" },
    { workflow_id: "w2", step_id: "em1", step_type: "email", head: "the checklist florida families wish they'd had before the last storm." },
    { workflow_id: "w3", step_id: "em2", step_type: "email", head: "the checklist florida families wish they'd had before the last storm." },
  ];
  const out = matchStepSends(steps, heads);

  it("sums every sent head the step's text explains, per channel", () => {
    expect(out.get("sms1")).toEqual({ sends: 45, contacts: 43, basis: "content" });
  });
  it("marks AI-written text unknown, never zero", () => {
    expect(out.get("ai1")?.basis).toBe("unknown");
    expect(out.get("ai1")?.sends).toBeNull();
  });
  it("marks a template shared by two steps ambiguous for both", () => {
    expect(out.get("em1")?.basis).toBe("ambiguous");
    expect(out.get("em2")?.basis).toBe("ambiguous");
    expect(out.get("em1")?.sends).toBe(300);
  });
});

describe("stamps and entries", () => {
  const tags = [
    { tag: "sent:s2.2-e1", adds: 120, contacts: 118 },
    { tag: "sent:w1.2-e1", adds: 3, contacts: 3 },
    { tag: "sent:s2.2-s1", adds: 90, contacts: 90 },
    { tag: "active-s2.2", adds: 200, contacts: 180 },
    { tag: "active-w1.2", adds: 2, contacts: 2 },
  ];
  const codes = ["S2.2", "W1.2", "W12"];

  it("reads a step's exact count across every spelling of the code", () => {
    const m = stampSends(tags, codes, [
      { stepId: "e1", type: "email", n: 1, stamped: true },
      { stepId: "e1b", type: "email", n: 1, stamped: true },
      { stepId: "s9", type: "sms", n: 9, stamped: true },
      { stepId: "x", type: "sms", n: 1, stamped: false },
    ]);
    expect(m.get("e1")).toMatchObject({ sends: 123, contacts: 121, basis: "stamp" });
    expect(m.get("e1")?.note).toContain("shared");
    expect(m.get("s9")).toEqual({ sends: 0, contacts: 0, basis: "stamp" });
    expect(m.has("x")).toBe(false);
  });
  it("counts entries and stamp totals", () => {
    expect(entries(tags, codes)).toBe(182);
    expect(stampTotal(tags, codes)).toEqual({ sends: 213, stamps: 3 });
  });
});

describe("summarizeWorkflow", () => {
  const content = new Map([
    ["a", { sends: 0, contacts: 0, basis: "content" as const }],
    ["b", { sends: null, contacts: null, basis: "unknown" as const }],
  ]);

  it("is silent only when measured and nothing went out", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["F.0"], stepIds: ["a", "b"], raw: raw({ tags: [{ tag: "active-f.0", adds: 465, contacts: 465 }] }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 0, entries30d: 465, basis: "content", silent: true });
  });
  it("is quiet, not silent, when nobody entered", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 1, codes: ["U.SEND-P"], stepIds: ["a"], raw: raw(), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 0, entries30d: 0, silent: false });
  });
  it("is null (could not tell) when every step is unknown", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 1, codes: ["S4.5"], stepIds: ["b"], raw: raw(), contentByStep: content });
    expect(s).toMatchObject({ sends30d: null, basis: "unknown", silent: null });
  });
  it("prefers stamps and is never silent with a stamp in the window", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["S2.2"], stepIds: ["a"], raw: raw({ tags: [{ tag: "sent:s2.2-e1", adds: 7, contacts: 7 }] }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 7, basis: "mixed", silent: false });
  });
  it("never calls a draft silent, and returns null when the snapshot failed", () => {
    const d = summarizeWorkflow({ status: "draft", messageSteps: 2, codes: ["X"], stepIds: ["a"], raw: raw(), contentByStep: content });
    expect(d?.silent).toBe(false);
    expect(summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["X"], stepIds: ["a"], raw: { ok: false, reason: "down" }, contentByStep: content })).toBeNull();
  });
});
