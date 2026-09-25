/**
 * The plain-English layer. Guards the promise the team was given (2026-09-25):
 * no timeline title shows a rule key, a tag or an LP code — those live on the
 * "Technical" line — and nothing unknown ever throws.
 */
import { describe, expect, it } from "vitest";
import { branchFiredWords, dispositionWords, eventTypeWords, ruleWords, tagWords, workflowLabel } from "./plain";

const REGISTRY = [
  { canonical_code: "E.0", canonical_name: "E.0 Master Router", legacy_name: "W0.0", workflow_id: "wf-e0" },
  { canonical_code: "E.4", canonical_name: "E.4 Canvassing & In-Person Bridge", legacy_name: "W0.4", workflow_id: "wf-e4" },
  { canonical_code: "S2.2", canonical_name: "Chatbot Indoctrination", legacy_name: "W1.2", workflow_id: "wf-s22" },
];

describe("dispositionWords", () => {
  it("reads the LP codes people see most", () => {
    expect(dispositionWords("Cnf")).toBe("Appointment confirmed");
    expect(dispositionWords("ND")).toBe("No demo — disqualified before issue");
    expect(dispositionWords("NOC")).toBe("Issued, but no rep could cover it");
    expect(dispositionWords("BO")).toBe("Be-back — rep to follow up");
    expect(dispositionWords("Issue")).toBe("Appointment issued to a rep");
    expect(dispositionWords("OPPFDN")).toBe("Demo done, no sale");
    expect(dispositionWords("CCC")).toBe("Cannot contact"); // Mark, 2026-09-25
    expect(dispositionWords("Sale")).toBe("Sold (contract signed)");
  });
  it("never invents a meaning for an unknown code", () => {
    expect(dispositionWords("NIS2")).toBe("LP status NIS2");
    expect(dispositionWords("OPPPRD")).toBe("LP status OPPPRD");
    expect(dispositionWords(null)).toBe("LP status changed");
  });
});

describe("ruleWords", () => {
  it("gives the top rules a sentence and keeps the key for troubleshooting", () => {
    expect(ruleWords("LP_DISP_CNF", "Rule LP_DISP_CNF: LP Cnf → Appointment Confirmed")).toEqual({
      title: "Appointment confirmed in Lead Perfection",
      technical: "Rule LP_DISP_CNF",
    });
    expect(ruleWords("BEHAVIORAL_DNC_REPLY", null).title).toBe("Lead texted STOP — texts and calls turned off");
  });
  it("reads job milestones from the key", () => {
    expect(ruleWords("P2_MILESTONE_INSTALL_START", "x").title).toBe("Job milestone: install started");
  });
  it("expands jargon in an unknown rule's own name instead of showing the key", () => {
    const r = ruleWords("LP_DISP_ISSUE_X", "Rule LP_DISP_ISSUE_X: LP Cnf -> W9.0 Objection (v2.1 safe)");
    expect(r.title).toBe("Automation: Lead Perfection confirmed → W9.0 Objection");
    expect(r.title).not.toContain("LP_DISP");
    expect(ruleWords("GHL_APPT_CXL_MIRROR", null).title).toBe("Automation: GHL appointment cancelled mirror");
    expect(ruleWords(null, null).title).toBe("Automation ran");
  });
});

describe("eventTypeWords", () => {
  it("names known events and hides opaque ids", () => {
    expect(eventTypeWords("lp.disposition_changed", "Cnf")).toBe("Lead Perfection status changed: Cnf");
    expect(eventTypeWords("agentic.handoff_started", "6cd679ff-a8a0-4c22-9948-83c38a41e157")).toBe("Chatbot took over the conversation");
    expect(eventTypeWords("ghl.appointment_booked", "aJj14ONxh1oFyDcQ706O")).toBe("Appointment booked");
  });
  it("still reads an event nobody mapped", () => {
    expect(eventTypeWords("five9.list_refreshed", "ok")).toBe("Dialer: list refreshed (ok)");
    expect(eventTypeWords("", null)).toBe("System event");
  });
});

describe("workflow and tag words", () => {
  it("names workflows from the registry and falls back to the code", () => {
    expect(workflowLabel("s2.2", REGISTRY)).toBe("S2.2 Chatbot Indoctrination");
    expect(workflowLabel("E.0", REGISTRY)).toBe("E.0 Master Router");
    expect(workflowLabel("W99", REGISTRY)).toBe("W99");
    expect(workflowLabel("E.2 Calculator Bridge v2", REGISTRY)).toBe("E.2 Calculator Bridge v2");
  });
  it("tells the E.0 routing as a sentence", () => {
    expect(branchFiredWords("E.0", "canvassing", "E.4", REGISTRY)).toBe(
      "E.0 Master Router sent this lead to E.4 Canvassing & In-Person Bridge (canvassing path)",
    );
    expect(branchFiredWords("E.0", null, null, REGISTRY)).toBe("E.0 Master Router picked a path");
  });
  it("reads tags", () => {
    expect(tagWords("active-s2.2", REGISTRY)).toBe("In S2.2 Chatbot Indoctrination");
    expect(tagWords("sent:e.4-s2", REGISTRY)).toBe("SMS 2 of E.4 Canvassing & In-Person Bridge sent");
    expect(tagWords("stage:appointment-rescue", REGISTRY)).toBe("Stage: appointment rescue");
    expect(tagWords("stop-bot", REGISTRY)).toBe("Chatbot stopped");
    expect(tagWords("hurricane-guide-sent", REGISTRY)).toBe("hurricane guide sent");
  });
});
