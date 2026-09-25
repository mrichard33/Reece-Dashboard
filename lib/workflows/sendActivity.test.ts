/**
 * The "is it sending" logic. The rule under test: "no sends seen" is EARNED —
 * enough leads in, fresh data, a measurement that saw nothing — never given
 * by a measurement that could not be made or a zero that means nothing.
 */
import { describe, expect, it } from "vitest";
import {
  annotateReach,
  entries,
  fingerprint,
  freshness,
  matchStepSends,
  outcomesFor,
  stampSends,
  stampTotal,
  stepSendsWords,
  summarizeWorkflow,
  type OutboundHead,
  type SendActivityRaw,
  type StepHead,
  type StepSends,
} from "./sendActivity";

const raw = (over: Partial<Extract<SendActivityRaw, { ok: true }>> = {}): SendActivityRaw => ({
  ok: true,
  computedAt: "2026-09-25T03:24:52Z",
  days: 30,
  tags: [],
  heads: [],
  stepHeads: [],
  fresh: { ok: true },
  outcomes: null,
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
  const entered = (n: number, code = "f.0") => [{ tag: `active-${code}`, adds: n, contacts: n }];

  it("says no sends seen only when measured, enough leads in, fresh, and nothing went out", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["F.0"], stepIds: ["a", "b"], raw: raw({ tags: entered(465) }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 0, entries30d: 465, basis: "content", verdict: "no_sends_seen" });
  });
  it("is too few to judge under the entry floor", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["F.0"], stepIds: ["a"], raw: raw({ tags: entered(5) }), contentByStep: content });
    expect(s?.verdict).toBe("too_few_to_judge");
    expect(s?.note).toContain("5 leads in");
  });
  it("withholds the verdict when the sync or snapshot was stale", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["F.0"], stepIds: ["a"], raw: raw({ tags: entered(465), fresh: { ok: false, reason: "HL's copy of GHL was 5 h behind when the snapshot ran" } }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 0, verdict: "unknown", note: "HL's copy of GHL was 5 h behind when the snapshot ran" });
  });
  it("is quiet, not a finding, when nobody entered", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 1, codes: ["U.SEND-P"], stepIds: ["a"], raw: raw(), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 0, entries30d: 0, verdict: "quiet" });
  });
  it("is unknown (could not tell) when every step is AI-written", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 1, codes: ["S4.5"], stepIds: ["b"], raw: raw({ tags: entered(100, "s4.5") }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: null, basis: "unknown", verdict: "unknown" });
  });
  it("prefers stamps and is sending with a stamp in the window", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["S2.2"], stepIds: ["a"], raw: raw({ tags: [{ tag: "sent:s2.2-e1", adds: 7, contacts: 7 }] }), contentByStep: content });
    expect(s).toMatchObject({ sends30d: 7, basis: "mixed", verdict: "sending" });
  });
  it("a stamped workflow with leads in and zero stamp adds is no sends seen too", () => {
    const s = summarizeWorkflow({ status: "published", messageSteps: 1, codes: ["S2.2"], stepIds: ["z"], raw: raw({ tags: [{ tag: "sent:s2.2-e1", adds: 0, contacts: 0 }, ...entered(50, "s2.2")] }), contentByStep: new Map() });
    expect(s).toMatchObject({ sends30d: 0, basis: "stamp", verdict: "no_sends_seen" });
  });
  it("never flags a draft, and returns null when the snapshot failed", () => {
    const d = summarizeWorkflow({ status: "draft", messageSteps: 2, codes: ["X"], stepIds: ["a"], raw: raw({ tags: entered(100, "x") }), contentByStep: content });
    expect(d?.verdict).toBe("quiet");
    expect(summarizeWorkflow({ status: "published", messageSteps: 2, codes: ["X"], stepIds: ["a"], raw: { ok: false, reason: "down" }, contentByStep: content })).toBeNull();
  });
  it("sums outcomes for the workflow's codes and leaves them null before 0024", () => {
    const rows = [
      { code: "s2.2", entries: 100, replied: 10, booked: 5, opted_out: 2 },
      { code: "w1.2", entries: 20, replied: 2, booked: 0, opted_out: 0 },
      { code: "e.0", entries: 999, replied: 0, booked: 0, opted_out: 0 },
    ];
    expect(outcomesFor(rows, ["S2.2", "W1.2"])).toEqual({ entries: 120, replied: 12, booked: 5, optedOut: 2, replyRate: 0.1, bookingRate: 5 / 120, optOutRate: 2 / 120 });
    expect(outcomesFor(rows, ["Q.9"])).toBeNull();
    expect(outcomesFor(null, ["S2.2"])).toBeNull();
  });
});

describe("freshness", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  it("is fresh when the snapshot is recent and the sync was close behind it", () => {
    expect(freshness("2026-09-25T09:07:00Z", "2026-09-25T08:45:00Z", now)).toEqual({ ok: true });
  });
  it("refuses an old snapshot, a missing sync time, or a sync far behind the snapshot", () => {
    expect(freshness("2026-09-24T09:07:00Z", "2026-09-24T09:00:00Z", now).ok).toBe(false);
    expect(freshness("2026-09-25T09:07:00Z", null, now).ok).toBe(false);
    const r = freshness("2026-09-25T09:07:00Z", "2026-09-25T04:00:00Z", now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("behind");
  });
});

describe("annotateReach and stepSendsWords", () => {
  const sched = [
    { stepId: "e1", branchPath: [], day: 0 },
    { stepId: "s1", branchPath: ["replied: no"], day: 1 },
    { stepId: "s2", branchPath: ["replied: no"], day: 3 },
    { stepId: "e9", branchPath: [], day: 45 },
  ];
  const c = (sends: number | null): StepSends => ({ sends, contacts: sends, basis: sends === null ? "unknown" : "content" });

  it("separates 'no one got here' from 'reached, nothing sent'", () => {
    const m = annotateReach(sched, new Map([["e1", c(0)], ["s1", c(0)], ["s2", c(0)], ["e9", c(0)]]), 100, 30);
    expect(m.get("e1")?.reach).toBe("reached"); // leads entered, first message
    expect(m.get("s1")?.reach).toBe("not_reached"); // e1 sent nothing
    expect(m.get("e9")?.reach).toBe("beyond_window");
    expect(stepSendsWords(m.get("e1"))).toEqual({ text: "reached, no sends seen", tone: "none" });
    expect(stepSendsWords(m.get("s1"))).toEqual({ text: "no one reached this step", tone: "unknown" });
    expect(stepSendsWords(m.get("e9"))?.text).toContain("outside the window");
  });
  it("follows the nearest earlier message on the same path", () => {
    const m = annotateReach(sched, new Map([["e1", c(40)], ["s1", c(0)], ["s2", c(0)]]), 100, 30);
    expect(m.get("s1")?.reach).toBe("reached");
    expect(m.get("s2")?.reach).toBe("not_reached");
  });
  it("is unknown without a tag code or after an unknown step", () => {
    expect(annotateReach(sched, new Map([["e1", c(0)]]), null, 30).get("e1")?.reach).toBe("unknown");
    expect(annotateReach(sched, new Map([["e1", c(null)], ["s1", c(0)]]), 100, 30).get("s1")?.reach).toBe("unknown");
    expect(stepSendsWords({ sends: 0, contacts: 0, basis: "content" })).toEqual({ text: "no sends seen", tone: "none" });
    expect(stepSendsWords({ sends: 12, contacts: 12, basis: "stamp" })?.text).toBe("12 sent · 30 d");
  });
});
