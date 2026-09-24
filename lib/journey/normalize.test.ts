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
    expect(titles).toContain("Stage → appointment rescue");
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
  const events = lpEvents(LP_TIMELINE);
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
    expect(rules[2]!.title).toBe("Rule LP_DISP_CNF: LP Cnf → Appointment Confirmed");
  });

  it("reads the E.0 branch as a workflow move and keeps LP's own GHL echoes quiet", () => {
    expect(byKind("branch_fired")[0]!.title).toBe("E.0 branch fired → canvassing → E.4");
    expect(byKind("lp_event").every((e) => e.quiet)).toBe(true);
    expect(byKind("lp_disposition")[0]!.title).toBe("LP disposition CCC");
    expect(byKind("note")[0]!.detail?.note).toContain("set by Y.Francis");
  });

  it("shows quiet rows only when their own lane is switched on", () => {
    const all = visibleEvents(events, []);
    expect(all.some((e) => e.quiet)).toBe(false);
    const bot = visibleEvents(events, ["bot"]);
    expect(bot).toHaveLength(3);
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
