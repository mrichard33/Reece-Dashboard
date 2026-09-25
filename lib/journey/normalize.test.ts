/**
 * Source rows → timeline rows. Protects the readability rules (one row per
 * real moment, quiet noise, ET titles) and the two traps found in live data:
 * appointment webhooks stamp event_time with the SLOT, and LP writes every
 * call twice.
 */
import { describe, expect, it } from "vitest";
import {
  appointmentEvents,
  collapseTagChurn,
  formatPhone,
  lpEvents,
  mergeSentTags,
  messageEvents,
  opportunityEvents,
  preview,
  tagDiffEvents,
  visibleEvents,
} from "./normalize";
import type { JourneyEvent } from "./types";
import { APPT_EVENTS, LP_TIMELINE, SNAPSHOT_AFTER, SNAPSHOT_BEFORE } from "./fixtures.moberly";


const REGISTRY = [
  { canonical_code: "E.0", canonical_name: "E.0 Master Router", legacy_name: "*W0.0 - Master Router", workflow_id: "407e" },
  { canonical_code: "E.4", canonical_name: "E.4 Canvassing & In-Person Bridge", legacy_name: "W0.4", workflow_id: "e4" },
];

describe("tagDiffEvents", () => {
  it("turns the Moberly cancel-day snapshots into named moments", () => {
    const events = tagDiffEvents(
      [
        { ts: "2026-09-24T00:19:21.354Z", tags: SNAPSHOT_BEFORE, created: false },
        { ts: "2026-09-24T15:44:30.532Z", tags: SNAPSHOT_AFTER, created: false },
      ],
      REGISTRY,
    );
    const titles = events.map((e) => e.title);
    expect(titles).toContain("Entered E.0 Master Router");
    expect(titles).toContain("Stage: appointment rescue");
    // Everything else collapses into one "Tags changed" row with the diff kept.
    const other = events.filter((e) => e.kind === "tags_changed");
    expect(other).toHaveLength(1);
    expect(other[0]!.detail?.added).toEqual(expect.arrayContaining(["agentic-inbound", "canceled-estimate"]));
  });

  it("treats the oldest surviving update as a baseline, not a burst", () => {
    const events = tagDiffEvents([{ ts: "2026-09-22T20:39:00Z", tags: SNAPSHOT_BEFORE, created: false }], REGISTRY);
    expect(events).toEqual([]);
  });

  it("does announce tags present at contact creation", () => {
    const events = tagDiffEvents([{ ts: "2026-09-22T20:34:37Z", tags: ["active-e.0", "x"], created: true }], REGISTRY);
    expect(events.map((e) => e.kind)).toEqual(["workflow_entered", "tags_changed"]);
  });
});

describe("collapseTagChurn", () => {
  const row = (ts: string, added: string[]): JourneyEvent => ({
    id: ts, ts, lane: "tag", kind: "tags_changed", title: "", detail: { added, removed: [] }, collapsedCount: 1,
  });
  it("folds tag bursts within 60s, even around a named event", () => {
    const out = collapseTagChurn([
      row("2026-09-24T15:00:00Z", ["a"]),
      { id: "w", ts: "2026-09-24T15:00:10Z", lane: "workflow", kind: "workflow_entered", title: "Entered" },
      row("2026-09-24T15:00:50Z", ["b", "c"]),
      row("2026-09-24T15:05:00Z", ["d"]),
    ]);
    expect(out.map((e) => e.kind)).toEqual(["tags_changed", "workflow_entered", "tags_changed"]);
    expect(out[0]!.title).toBe("Tags changed (+3)");
    expect(out[0]!.collapsedCount).toBe(2);
  });
});

describe("appointmentEvents", () => {
  it("times a cancel by dateUpdated, not the slot, and says what it was", () => {
    const events = appointmentEvents([], APPT_EVENTS);
    expect(events.map((e) => e.kind)).toEqual(["appointment_booked", "appointment_cancelled"]);
    const cancel = events[1]!;
    expect(cancel.ts).toBe("2026-09-24T15:43:21.000Z"); // 11:43 AM ET — spec timeline
    expect(cancel.title).toBe("Window Estimate CANCELLED (was Thu Sep 24, 5:00 PM ET)");
    expect(events[0]!.title).toBe("Window Estimate booked — Thu Sep 24, 5:00 PM ET");
  });

  it("reports a reschedule when a later booking moves the slot", () => {
    const moved = { ...APPT_EVENTS[0]!, start_time: "2026-09-25T09:00:00-04:00", date_updated: "2026-09-23T12:00:00Z", appt_status: "confirmed" };
    const kinds = appointmentEvents([], [APPT_EVENTS[0]!, moved]).map((e) => e.kind);
    expect(kinds).toEqual(["appointment_booked", "appointment_rescheduled"]);
  });
});

describe("opportunityEvents", () => {
  const pipelines = [
    { ghl_pipeline_id: "x0cx", name: "1. Antifragile Buyer Activation Pipeline", stages: [{ id: "s6", name: "6. Appointment Booked" }, { id: "s3", name: "3. Engaged" }] },
  ];
  const base = { event_time: "2026-09-22T20:50:59Z", tags: null, obj_id: "opp1", date_added: null, date_updated: null, appt_status: null, start_time: null, title: null, source: null, appt: null, pipeline_id: "x0cx" };
  it("opens, then reports stage and status moves with P-labels", () => {
    const events = opportunityEvents(
      [],
      [
        { ...base, event_type: "opportunity_created", ts: "2026-09-22T20:50:59.908Z", stage_id: "s3", status: "open" },
        { ...base, event_type: "opportunity_updated", ts: "2026-09-23T10:00:00Z", stage_id: "s6", status: "open" },
        { ...base, event_type: "opportunity_updated", ts: "2026-09-24T15:43:28.678Z", stage_id: "s6", status: "abandoned" },
      ],
      pipelines,
    );
    expect(events.map((e) => e.title)).toEqual([
      "P1 opportunity opened — 3. Engaged",
      "P1 → 6. Appointment Booked",
      "P1 opportunity abandoned",
    ]);
  });
});

describe("lpEvents", () => {
  const events = lpEvents(LP_TIMELINE, REGISTRY);
  const byKind = (k: string) => events.filter((e) => e.kind === k);

  it("folds LP's duplicate call activity into the call and names the result", () => {
    expect(byKind("activity")).toHaveLength(0);
    expect(byKind("call").map((e) => e.title)).toEqual(["Call — Left voicemail", "Call — No answer"]);
    expect(byKind("call")[0]!.actor).toBe("Mercado, Paula");
  });

  it("never leaks the raw LP row into detail", () => {
    for (const e of events) expect(JSON.stringify(e.detail ?? {})).not.toContain("raw_lp_data");
  });

  it("names rules and hides skipped ones by default (spec verification #3)", () => {
    const rules = byKind("agent_action");
    expect(rules.map((e) => e.refs?.ruleId)).toEqual(["LP_APPT_GHL_SYNC_CNF", "LP_APPT_GHL_SYNC_CNF", "LP_DISP_CNF"]);
    expect(rules[0]!.quiet).toBe(true);
    expect(rules[0]!.title).toContain("(skipped)");
    expect(rules[2]!.title).toBe("Appointment confirmed in Lead Perfection");
    expect(rules[2]!.detail?.technical).toContain("Rule LP_DISP_CNF");
  });

  it("reads the E.0 branch as a workflow move and keeps LP's own GHL echoes quiet", () => {
    expect(byKind("branch_fired")[0]!.title).toBe("E.0 Master Router sent this lead to E.4 Canvassing & In-Person Bridge (canvassing path)");
    expect(byKind("lp_event").every((e) => e.quiet)).toBe(true);
    expect(byKind("lp_disposition")[0]!.title).toBe("Lead Perfection: Cancelled — could not confirm");
    expect(byKind("lp_disposition")[0]!.detail?.technical).toBe("LP status CCC");
    expect(byKind("note")[0]!.detail?.note).toContain("set by Y.Francis");
  });

  it("keeps quiet and system rows behind 'Show system detail'", () => {
    const all = visibleEvents(events, []);
    expect(all.some((e) => e.quiet || e.lane === "system")).toBe(false);
    const withSystem = visibleEvents(events, [], true);
    expect(withSystem.length).toBe(events.length);
    // Rules live under "Workflow & status"; the skipped one needs the toggle.
    expect(visibleEvents(events, ["workflow"]).filter((e) => e.kind === "agent_action")).toHaveLength(2);
    expect(visibleEvents(events, ["workflow"], true).filter((e) => e.kind === "agent_action")).toHaveLength(3);
  });
});

describe("messages", () => {
  it("merges a sent:* tag into the SMS it announced (5-minute window)", () => {
    const msgs = messageEvents([
      { ghl_message_id: "m1", direction: "outbound", type: "2", body: "Quick question about your windows", status: "delivered", sent_at: "2026-09-24T13:00:30Z" },
      { ghl_message_id: "m2", direction: "inbound", type: "2", body: "yes", status: "delivered", sent_at: "2026-09-24T13:10:00Z" },
    ]);
    const tag: JourneyEvent = {
      id: "tag:x:+sent:e.4-s2", ts: "2026-09-24T13:00:00Z", lane: "message", kind: "sms_out",
      title: "SMS 2 of E.4 sent", actor: "E.4", refs: { workflowCode: "E.4" }, detail: { tag: "sent:e.4-s2", n: 2 },
    };
    const merged = mergeSentTags([tag, ...msgs]);
    expect(merged).toHaveLength(2);
    const out = merged.find((e) => e.id === "msg:m1")!;
    expect(out.actor).toBe("E.4");
    expect(out.title).toBe('→ SMS 2 of E.4 — "Quick question about your windows"');
    expect(merged.find((e) => e.id === "msg:m2")!.title).toBe('← SMS: "yes"');
  });

  it("previews email HTML as text", () => {
    expect(preview("<html><style>p{}</style><p>Hello&nbsp;<b>Joy</b></p></html>")).toBe("Hello Joy");
    expect(preview("x".repeat(200)).length).toBe(90);
  });

  it("formats US phones", () => {
    expect(formatPhone("+14073739355")).toBe("(407) 373-9355");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
  });
});

// Blankenbicker, Scott & Emmeline (ZTYTXNV1WrV6X0wSM7Fe), live 2026-09-25:
// four LP leads under Prospect 451087, and LP stores every call once per lead.
describe("one person, several LP leads", () => {
  const LEADS = ["565558", "565976", "571323", "576694"];
  const copies = (ts: string, result: string, rep: string) =>
    LEADS.map((lead, i) => ({
      ts,
      source: "lp",
      type: "call",
      summary: "Call",
      detail: { id: `${ts}-${i}`, rep, lp_lead_id: lead, raw: { call_result: result, call_duration_sec: null } },
    }));
  const items = [
    ...copies("2026-09-20T16:24:09+00:00", "CONF", "Massingill, Kaley"),
    ...copies("2026-09-20T15:28:18+00:00", "HU", "[None], [None]"),
    ...copies("2026-09-20T13:53:04+00:00", "NA", "Massingill, Kaley"),
  ];

  it("shows each real call once, not once per lead", () => {
    const calls = lpEvents(items).filter((e) => e.lane === "call");
    expect(calls.map((c) => c.title)).toEqual([
      "Call — Confirmed the appointment",
      "Call — Hung up",
      "Call — No answer",
    ]);
    expect(calls[1]!.actor).toBe("Dialer"); // "[None], [None]" is nobody
  });

  it("merges the Five9 disposition into the LP call it describes", () => {
    const five9 = {
      ts: "2026-09-20T16:25:30+00:00",
      source: "agentic",
      type: "event:five9.disposition_set",
      summary: "five9.disposition_set",
      detail: { id: 9, payload: { disposition_name: "Confirmed", agent_name: "Kaley Massingill", duration_sec: 241 } },
    };
    const calls = lpEvents([...items, five9]).filter((e) => e.lane === "call");
    expect(calls).toHaveLength(3);
    expect(calls[0]!.title).toBe("Call 4m01s — Confirmed the appointment");
  });
});

describe("Revin and chatbot summaries", () => {
  const note = (rep: string, body: string, origin = "lp") => ({
    ts: "2026-09-24T15:03:02.283+00:00",
    source: "lp",
    type: "note",
    summary: body,
    detail: { id: `${rep}-1`, full_note: body, rep, note_origin: origin, lp_lead_id: "1" },
  });

  it("shows a Revin summary as a message, not a note", () => {
    const [e] = lpEvents([note("Agent, Revin", "User, Zeenat, requests a free windows estimate from Reece Windows.")]);
    expect(e).toMatchObject({ lane: "message", kind: "revin_sms_summary", actor: "Revin (LP)" });
    expect(e!.title).toContain("Revin texted with the lead");
  });

  it("keeps the chatbot's AI brief quiet — the chat itself is already in the timeline", () => {
    const [e] = lpEvents([note("Agent, Agentic", "[GHL · AI BRIEF · 9/8/26 7:12 PM]  COLD · appt NOT set", "ghl_ai_brief")]);
    expect(e).toMatchObject({ lane: "lp", kind: "ai_brief", quiet: true });
  });

  it("keeps a rep's note a note", () => {
    const [e] = lpEvents([note("Pettit, Jordan", "Spoke with Joy who wants a quote for 10 windows")]);
    expect(e).toMatchObject({ lane: "note", kind: "note" });
  });
});
