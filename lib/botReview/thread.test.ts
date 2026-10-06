import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  isActivityTurn,
  skipReasonLabel,
  ACTIVITY_BODY_PATTERNS,
  type TimelineItem,
  type TimelineTurn,
  type TimelineMessage,
  type SnapshotTurn,
  type TimelineRow,
} from "./core";

/*
 * Charles Jessup (GHL LmBvkJUNrqZ9HoVNuovP), as it sat in bot_message_context
 * on 2026-10-06. Row 396 is a rule-written send (SERVICE_AREA_EXIT) with no
 * inbound and no snapshot; 397 is a skip; 414 carries the 10-turn snapshot with
 * every turn undated and channel-less, six GHL activity rows among them.
 */
const HEADING_OUT = "Heading out right now. I'll touch base with you this afternoon.";
const THANKS =
  "Thanks, Charles, it looks like your area's outside our current service footprint, so I can't set up a visit there. Wish we could help!";
const ANYTIME = "Anytime. Talk soon. Before your visit, is there anything you're wondering about that I can pass along?";

const charlesRows = [
  {
    context_id: 396,
    message_type: "reply",
    rule_applied: "SERVICE_AREA_EXIT",
    inbound_text: null,
    reply_text: THANKS,
    generated_at: "2026-10-05T14:34:35.797+00:00",
    sent_at: "2026-10-05T14:34:40.974+00:00",
  },
  {
    context_id: 397,
    message_type: "skip",
    inbound_text: HEADING_OUT,
    reply_text: null,
    skip_reason: "superseded_by_newer_job",
    generated_at: "2026-10-05T14:34:42.004+00:00",
    sent_at: null,
  },
  {
    context_id: 414,
    message_type: "reply",
    inbound_text: "Ok thanks",
    reply_text: ANYTIME,
    generated_at: "2026-10-05T14:54:59.369+00:00",
    sent_at: "2026-10-05T14:55:00.224+00:00",
  },
];

const out = (body: string): SnapshotTurn => ({ at: null, body, channel: null, direction: "outbound" });
const charlesSnapshot: SnapshotTurn[] = [
  out("Opportunity created"),
  out("Opportunity created"),
  out("Charles Jessup - Window Estimate"),
  out("Charles Jessup - Window Estimate"),
  out("Opportunity updated"),
  out("Opportunity updated"),
  out(
    "Charles, the Reece team here. Ninety minutes in your home was the wrong first step, and that's on us. The 15-minute version is a phone call: https://link.reecewindows.com/l/4XP47NqIYSj\nReply STOP to opt out.\nThanks, Reece Windows & Doors",
  ),
  { at: null, body: HEADING_OUT, channel: null, direction: "inbound" },
  out(THANKS),
  { at: null, body: "Ok thanks", channel: null, direction: "inbound" },
];

/** What a reviewer reads, top to bottom. */
function render(items: TimelineItem[], rows: Array<TimelineRow & { skip_reason?: string | null }> = charlesRows): string[] {
  const byId = new Map(rows.map((r) => [r.context_id, r]));
  return items.map((i) => {
    if (i.kind === "turn") return `${i.inbound ? "lead" : "other"}: ${i.body}`;
    const r = byId.get(i.contextId)!;
    return r.message_type === "skip" ? `note: ${skipReasonLabel(r.skip_reason)}` : `bot: ${r.reply_text}`;
  });
}

describe("Bot Review thread — Charles Jessup", () => {
  const items = buildTimeline(charlesRows, new Map([[414, charlesSnapshot]]), {
    cutoverAt: "2026-09-11T19:00:00Z",
  });

  it("reads in order, as it happened", () => {
    expect(render(items)).toEqual([
      `lead: ${HEADING_OUT}`,
      `bot: ${THANKS}`,
      "note: a newer message took over",
      "lead: Ok thanks",
      `bot: ${ANYTIME}`,
    ]);
  });

  it("shows no Opportunity rows", () => {
    expect(render(items).some((l) => /Opportunity|Window Estimate/.test(l))).toBe(false);
  });

  it("shows nothing from before the bot's first message but the inbound it answered", () => {
    expect(render(items)[0]).toBe(`lead: ${HEADING_OUT}`);
    expect(render(items).some((l) => l.includes("Ninety minutes"))).toBe(false);
  });

  it("gives the rule-written reply the lead message it answered", () => {
    const m = items.find((i): i is TimelineMessage => i.kind === "message" && i.contextId === 396)!;
    expect(m.replyingTo).toBe(HEADING_OUT);
  });

  it("never stamps an undated turn with a message's time", () => {
    const turns = items.filter((i): i is TimelineTurn => i.kind === "turn");
    expect(turns.every((t) => t.at === null)).toBe(true);
  });

  it("shows a live-chat reply's lead message when the row has no snapshot", () => {
    const rows = [
      { context_id: 1, message_type: "reply", inbound_text: "yes", reply_text: "Great, which day?", generated_at: "2026-10-06T14:55:00Z" },
      { context_id: 2, message_type: "reply", inbound_text: "tomorrow at 10am", reply_text: "Holding it.", generated_at: "2026-10-06T14:56:00Z" },
    ];
    expect(render(buildTimeline(rows, new Map()), rows)).toEqual([
      "lead: yes",
      "bot: Great, which day?",
      "lead: tomorrow at 10am",
      "bot: Holding it.",
    ]);
  });

  it("shows a second, identical short answer as its own message", () => {
    const rows = [
      { context_id: 1, message_type: "reply", inbound_text: "yes", reply_text: "Fixed or replaced?", generated_at: "2026-10-06T14:53:00Z" },
      { context_id: 2, message_type: "reply", inbound_text: "fixed", reply_text: "Would a visit help?", generated_at: "2026-10-06T14:54:00Z" },
      { context_id: 3, message_type: "reply", inbound_text: "yes", reply_text: "10 AM or 6 PM?", generated_at: "2026-10-06T14:55:00Z" },
    ];
    expect(render(buildTimeline(rows, new Map()), rows).filter((l) => l === "lead: yes")).toHaveLength(2);
  });

  it("quotes a skip's inbound when the thread does not already show it", () => {
    const rows = [charlesRows[1]!];
    const r = render(buildTimeline(rows, new Map()), rows);
    expect(r).toEqual([`lead: ${HEADING_OUT}`, "note: a newer message took over"]);
  });
});

describe("activity rows", () => {
  it("hides a turn LP MCP marked as activity, whatever it says", () => {
    expect(isActivityTurn({ direction: "outbound", body: "anything", kind: "activity" })).toBe(true);
    expect(isActivityTurn({ direction: "outbound", body: "Opportunity created", kind: "message" })).toBe(false);
  });

  it("recognises the old-snapshot activity texts, and only those", () => {
    for (const body of [
      "Opportunity created",
      "Opportunity updated",
      "Opportunity status changed",
      "Appointment booked",
      "Appointment cancelled",
      "Task completed",
      "Note added",
      "Charles Jessup - Window Estimate",
    ]) {
      expect(isActivityTurn({ direction: "outbound", body, channel: null }), body).toBe(true);
    }
    expect(isActivityTurn({ direction: "outbound", body: "Your appointment was created for Tuesday.", channel: null })).toBe(false);
    expect(isActivityTurn({ direction: "inbound", body: "Opportunity created", channel: null })).toBe(false);
    expect(isActivityTurn({ direction: "outbound", body: "Opportunity created", channel: "sms" })).toBe(false);
    expect(ACTIVITY_BODY_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe("cutover and ordering", () => {
  it("hides a timestamped turn before review_thread_cutover_at", () => {
    const rows = [
      { context_id: 0, reply_text: "Hi", generated_at: "2026-09-01T10:00:00Z" },
      { context_id: 1, reply_text: "Sure", generated_at: "2026-09-12T10:00:00Z" },
    ];
    const items = buildTimeline(
      rows,
      new Map([
        [
          1,
          [
            { direction: "outbound", body: "Hi", at: "2026-09-01T10:00:00Z" },
            { direction: "inbound", body: "old question", at: "2026-09-02T10:00:00Z" },
            { direction: "inbound", body: "new question", at: "2026-09-12T09:00:00Z" },
          ],
        ],
      ]),
      { cutoverAt: "2026-09-11T19:00:00Z" },
    );
    const bodies = items.filter((i): i is TimelineTurn => i.kind === "turn").map((t) => t.body);
    expect(bodies).toEqual(["new question"]);
  });

  it("keeps undated turns between the two replies they sat between", () => {
    const rows = [
      { context_id: 1, reply_text: "A", generated_at: "2026-09-20T10:00:00Z" },
      { context_id: 2, reply_text: "B", generated_at: "2026-09-20T12:00:00Z" },
      { context_id: 3, reply_text: "C", generated_at: "2026-09-20T14:00:00Z" },
    ];
    const items = buildTimeline(
      rows,
      new Map([
        [
          3,
          [
            { direction: "inbound", body: "q1" },
            { direction: "outbound", body: "A" },
            { direction: "inbound", body: "q2" },
            { direction: "outbound", body: "B" },
            { direction: "inbound", body: "q3" },
          ],
        ],
      ]),
    );
    expect(items.map((i) => (i.kind === "turn" ? i.body : `#${i.contextId}`))).toEqual([
      "q1",
      "#1",
      "q2",
      "#2",
      "q3",
      "#3",
    ]);
  });

  it("shows no snapshot turns before the first message when nothing can place them", () => {
    const rows = [{ context_id: 1, reply_text: "First", generated_at: "2026-09-20T10:00:00Z" }];
    const items = buildTimeline(rows, new Map([[1, [{ direction: "outbound", body: "an old workflow text" }]]]));
    expect(items.map((i) => i.kind)).toEqual(["message"]);
  });

  it("translates skip codes to plain words and shows an unknown code as itself", () => {
    expect(skipReasonLabel("superseded_by_newer_job")).toBe("a newer message took over");
    expect(skipReasonLabel("brand_new_code")).toBe("brand_new_code");
    expect(skipReasonLabel(null)).toBe("no reason recorded");
  });
});
