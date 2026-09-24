/**
 * The tag grammar is the journey's enrollment record (workflow_executions
 * covers ~25 workflows; tags cover all of them). If parsing drifts, "Now"
 * names the wrong workflow and "Next" projects from the wrong step.
 */
import { describe, expect, it } from "vitest";
import {
  activeWorkflowCodes,
  botState,
  codesFor,
  diffTagSnapshots,
  entryLane,
  lpRoute,
  parseTag,
  resolveWorkflowCode,
  sentPosition,
  suppressionFor,
} from "./tags";
import { SNAPSHOT_AFTER, SNAPSHOT_BEFORE } from "./fixtures.moberly";

describe("parseTag", () => {
  it("reads sent:<code>-<e|s><n> (spec verification #1)", () => {
    expect(parseTag("sent:s2.2-e3")).toEqual({ kind: "sent", code: "S2.2", channel: "email", n: 3 });
    expect(parseTag("sent:e.4-s12")).toEqual({ kind: "sent", code: "E.4", channel: "sms", n: 12 });
  });

  it("reads active-<code>, uppercased, legacy codes kept as-is", () => {
    expect(parseTag("active-s2.2")).toEqual({ kind: "active_workflow", code: "S2.2" });
    expect(parseTag("active-e.0")).toEqual({ kind: "active_workflow", code: "E.0" });
    expect(parseTag("active-w9.0")).toEqual({ kind: "active_workflow", code: "W9.0" });
  });

  it("does not read active-entry:* as a workflow", () => {
    expect(parseTag("active-entry:canvassing")).toEqual({ kind: "entry", value: "canvassing", active: true });
    expect(parseTag("entry:canvassing")).toEqual({ kind: "entry", value: "canvassing", active: false });
  });

  it("puts stage:dnc in the consent family, not the funnel", () => {
    expect(parseTag("stage:dnc")).toEqual({ kind: "bot", value: "stage:dnc" });
    expect(parseTag("stage:appointment-rescue")).toEqual({ kind: "stage", value: "appointment-rescue" });
  });

  it("reads LP mirrors and sources", () => {
    expect(parseTag("lp-route:appt-confirmed")).toEqual({ kind: "lp_route", value: "appt-confirmed" });
    expect(parseTag("lp-lead-issued")).toEqual({ kind: "lp_status", value: "issued" });
    expect(parseTag("source:internet-lead-gurus")).toEqual({ kind: "source", value: "internet-lead-gurus" });
    expect(parseTag("canvass-v2")).toEqual({ kind: "other", value: "canvass-v2" });
  });
});

describe("diffTagSnapshots", () => {
  it("emits stage:appointment-rescue added across the two Moberly snapshots (spec verification #1)", () => {
    const { added, removed } = diffTagSnapshots(SNAPSHOT_BEFORE, SNAPSHOT_AFTER);
    expect(added).toContain("stage:appointment-rescue");
    expect(added).toContain("active-e.0");
    expect(removed).toContain("stage:new-lead");
    expect(removed).not.toContain("agentic-active");
  });

  it("is empty for identical snapshots", () => {
    expect(diffTagSnapshots(["a", "b"], ["b", "a"])).toEqual({ added: [], removed: [] });
  });
});

describe("botState / suppressionFor", () => {
  it("ranks DNC > stop-bot > agentic-active > none", () => {
    expect(botState(["agentic-active", "stop-bot", "dnc-sms"])).toBe("dnc");
    expect(botState(["agentic-active", "stop-bot"])).toBe("stopped");
    expect(botState(["agentic-active"])).toBe("active");
    expect(botState(["lp-linked"])).toBe("none");
    expect(botState(["STAGE:DNC"])).toBe("dnc");
  });

  it("separates stopped automation from paused nurture", () => {
    expect(suppressionFor(["unsubscribed"])).toEqual({ kind: "stopped", reason: "unsubscribed" });
    expect(suppressionFor(["stop-bot"])).toEqual({ kind: "stopped", reason: "stop-bot" });
    // SMS STOP alone: texts stop, email continues (BEHAVIORAL_DNC_REPLY, FCC 24-24).
    expect(suppressionFor(["dnc-sms"])).toEqual({ kind: "texts", reason: "dnc-sms" });
    expect(suppressionFor(["dnc-sms", "dnc"])).toEqual({ kind: "stopped", reason: "dnc" });
    expect(suppressionFor(["dnc-sms", "stop-bot"])).toEqual({ kind: "stopped", reason: "stop-bot" });
    expect(suppressionFor(["cooling-active"])).toEqual({ kind: "paused", reason: "cooling-active" });
    expect(suppressionFor(["agentic-active"])).toBeNull();
  });
});

describe("position and lane", () => {
  it("takes the highest sent:* per channel for the given codes only", () => {
    const tags = ["sent:s2.2-e1", "sent:s2.2-e2", "sent:s2.2-s1", "sent:e.4-e5"];
    expect(sentPosition(tags, ["S2.2"])).toMatchObject({ email: 2, sms: 1 });
    expect(sentPosition(tags, ["E.4"])).toMatchObject({ email: 5, sms: 0 });
  });

  it("prefers active-entry over entry, and the last lp-route", () => {
    expect(entryLane(["entry:other", "active-entry:canvassing"])).toBe("canvassing");
    expect(entryLane(["entry:other"])).toBe("other");
    expect(lpRoute(SNAPSHOT_AFTER)).toBe("appt-confirmed");
    expect(activeWorkflowCodes(SNAPSHOT_AFTER)).toEqual(["E.0"]);
  });
});

describe("registry mapping", () => {
  const registry = [
    { canonical_code: "O.0", canonical_name: "O.0 Objection Handler", legacy_name: "W9.0 - Objection Handler", workflow_id: "fdf4" },
    { canonical_code: "S2.2", canonical_name: "S2.2 Chatbot Indoctrination", legacy_name: "*W1.2 - Chatbot Indoctrination", workflow_id: "ea3c" },
  ];

  it("maps canonical and legacy tag codes to the same row", () => {
    expect(resolveWorkflowCode("S2.2", registry)?.workflow_id).toBe("ea3c");
    expect(resolveWorkflowCode("W9.0", registry)?.canonical_code).toBe("O.0");
    expect(resolveWorkflowCode("W1.2", registry)?.canonical_code).toBe("S2.2");
    expect(resolveWorkflowCode("Z.9", registry)).toBeNull();
  });

  it("lists every code a row answers to, including the dotless legacy spelling", () => {
    expect(codesFor(registry[0]!)).toEqual(["O.0", "W9.0", "W90"]);
    expect(codesFor(registry[1]!)).toEqual(["S2.2", "W1.2", "W12"]);
  });

  it("maps E.4's `active-w04` (registry says W0.4) to E.4", () => {
    const withE4 = [
      ...registry,
      { canonical_code: "E.4", canonical_name: "E.4 Canvassing Bridge", legacy_name: "*W0.4 - Canvassing Pre-Frame Bridge", workflow_id: "d526" },
    ];
    expect(parseTag("active-w04")).toEqual({ kind: "active_workflow", code: "W04" });
    expect(resolveWorkflowCode("W04", withE4)?.canonical_code).toBe("E.4");
  });
});
