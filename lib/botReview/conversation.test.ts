import { describe, expect, it, vi } from "vitest";
import {
  buildConversation,
  buildWhyText,
  collapsedSessionLine,
  defaultOpenSessions,
  groupIssues,
  mergeTagEvents,
  tagEventsFromHistory,
  toSessionBlocks,
  matchBotMessages,
  queueIssueChips,
  timeEt,
  type BotRow,
  type ConvItem,
  type HlMessage,
  type TagEvent,
} from "./conversation";
import { buildLeadStatus } from "./leadStatus";
import { THREAD_EVENT_TAGS } from "./contactTags";
import { createThumbsUp, type QuickDeps } from "./quickReview";

/*
 * Charles Jessup (GHL LmBvkJUNrqZ9HoVNuovP), read live 2026-10-06: his eight
 * HL messages, bot_message_context rows 396 / 397 / 414, and his agent_actions
 * tag events. Bodies are trimmed where they ran long; nothing else changed.
 */
const MESSAGES: HlMessage[] = [
  { ghl_message_id: "lje30sVa41O2xLdFF4YC", direction: "outbound", type: "2", sent_at: "2026-10-05T10:24:12.012-04:00",
    body: "Charles, the Reece team here. Ninety minutes in your home was the wrong first step, and that's on us. The 15-minute version is a phone call." },
  { ghl_message_id: "0mfkDM4Pbxhv3bvIxtsF", direction: "inbound", type: "2", sent_at: "2026-10-05T10:32:57.982-04:00",
    body: "Heading out right now. I'll touch base with you this afternoon." },
  { ghl_message_id: "cj7VLZhxuI2r77Eanqnp", direction: "outbound", type: "2", sent_at: "2026-10-05T10:34:40.209-04:00",
    body: "Thanks, Charles, it looks like your area's outside our current service footprint, so I can't set up a visit there. Wish we could help!" },
  { ghl_message_id: "5sQTs77YRROo0aNQGBnW", direction: "inbound", type: "2", sent_at: "2026-10-05T10:53:58.719-04:00", body: "Ok thanks" },
  { ghl_message_id: "eBCT79Y2NLyTp5ZxOUu0", direction: "outbound", type: "2", sent_at: "2026-10-05T10:54:59.769-04:00",
    body: "Anytime. Talk soon. Before your visit, is there anything you're wondering about that I can pass along?" },
  { ghl_message_id: "X6ujXRHz75X9dqjtKU0S", direction: "outbound", type: "3", sent_at: "2026-10-05T15:24:17.343-04:00",
    body: "No rebook ask in this email. Just an honest reframe of what should have been said first." },
  { ghl_message_id: "a7Hudr47RJ7F7dnX8c0C", direction: "outbound", type: "2", sent_at: "2026-10-06T09:24:21.253-04:00",
    body: "Charles, most homeowners never find out where their home may be vulnerable until someone looks." },
  { ghl_message_id: "2ADNFj5uIFfvZ2A8XQvf", direction: "inbound", type: "2", sent_at: "2026-10-06T09:46:20.371-04:00", body: "Stop." },
];

const ROWS: BotRow[] = [
  { context_id: 396, message_type: "reply", rule_applied: "SERVICE_AREA_EXIT", channel: "sms", skip_reason: null,
    reply_text: "Thanks, Charles, it looks like your area's outside our current service footprint, so I can't set up a visit there. Wish we could help!",
    inbound_text: null, generated_at: "2026-10-05T14:34:35.797+00:00", sent_at: "2026-10-05T14:34:40.974+00:00", ai_score: 10 },
  { context_id: 397, message_type: "skip", rule_applied: "LAYER3_DISPATCH", channel: "sms", skip_reason: "superseded_by_newer_job",
    reply_text: null, inbound_text: "Heading out right now. I'll touch base with you this afternoon.",
    generated_at: "2026-10-05T14:34:42.004+00:00", sent_at: null, ai_score: null },
  { context_id: 414, message_type: "reply", rule_applied: "AGENTIC_RESPOND_POST_CHATBOT", channel: "sms", skip_reason: null,
    reply_text: "Anytime. Talk soon. Before your visit, is there anything you're wondering about that I can pass along?",
    inbound_text: "Ok thanks", generated_at: "2026-10-05T14:54:59.369+00:00", sent_at: "2026-10-05T14:55:00.224+00:00", ai_score: 50 },
];

const TAGS: TagEvent[] = [
  // Before the conversation shown: never rendered.
  { tag: "agentic-active", action: "add_tag", at: "2026-10-05T13:24:38.507+00:00" },
  { tag: "out-of-area", action: "add_tag", at: "2026-10-05T14:34:44.849+00:00" },
  { tag: "suppress-outbound", action: "add_tag", at: "2026-10-05T14:34:48.878+00:00" },
  { tag: "agentic-active", action: "add_tag", at: "2026-10-05T14:54:39.374+00:00" },
  { tag: "suppress:dnc-reply", action: "add_tag", at: "2026-10-06T13:47:16.382+00:00" },
  { tag: "dnc-sms", action: "add_tag", at: "2026-10-06T13:47:16.496+00:00" },
];

const charles = () =>
  buildConversation({ messages: MESSAGES, rows: ROWS, tagEvents: TAGS, cutoverAt: "2026-09-11T19:00:00Z", mustReviewScoreBelow: 60 });

/** One line per item, the way a reviewer reads the thread. */
function lines(items: ConvItem[]): string[] {
  return items.map((i) => {
    switch (i.kind) {
      case "day": return `── ${i.label} ──`;
      case "session": return `[${i.label} · ${i.count} · ${timeEt(i.startAt)}]`;
      case "lead": return `lead ${timeEt(i.at)}: ${i.body.slice(0, 20)}`;
      case "bot": return `bot ${timeEt(i.at)} #${i.contextId}${i.issues.map((x) => ` {${x.label}}`).join("")}`;
      case "other_outbound": return `${i.channelLabel} ${timeEt(i.at)} (Workflow or team)${i.issues.map((x) => ` {${x.label}}`).join("")}`;
      case "event": return `event ${timeEt(i.at)}: ${i.text}`;
    }
  });
}

describe("buildConversation — Charles Jessup", () => {
  it("is in real-time order, new system only, with quiet event lines", () => {
    expect(lines(charles().items)).toEqual([
      "── Monday, Oct 5 ──",
      "[GHL workflow / team · 1 · 10:24 AM]",
      "SMS 10:24 AM (Workflow or team)",
      "[Agentic bot · Service-area check · 1 · 10:34 AM]",
      "lead 10:32 AM: Heading out right no",
      "bot 10:34 AM #396 {AI score 10}",
      "event 10:34 AM: Bot didn't reply · a newer message took over",
      "event 10:34 AM: Marked out of service area · Outbound messages paused",
      "event 10:54 AM: Bot turned on",
      "[Agentic bot · Reply · 1 · 10:54 AM]",
      "lead 10:53 AM: Ok thanks",
      "bot 10:54 AM #414 {Sent after out-of-area} {AI score 50}",
      "[GHL workflow / team · 1 · 3:24 PM]",
      "Email 3:24 PM (Workflow or team) {Sent after outbound paused}",
      "── Tuesday, Oct 6 ──",
      "[GHL workflow / team · 1 · 9:24 AM]",
      "SMS 9:24 AM (Workflow or team) {Sent after outbound paused}",
      "lead 9:46 AM: Stop.",
      "event 9:47 AM: Opted out · texts and calls stopped",
    ]);
  });

  it("shows what each bot message was answering", () => {
    const bots = charles().items.filter((i): i is Extract<ConvItem, { kind: "bot" }> => i.kind === "bot");
    expect(bots.map((b) => b.replyingTo)).toEqual(["Heading out right now. I'll touch base w…", "Ok thanks"]);
    expect(bots.every((b) => b.matched)).toBe(true);
  });

  it("never shows a GHL activity row or the old-system notice twice", () => {
    const view = charles();
    expect(JSON.stringify(view.items)).not.toMatch(/Opportunity/);
    expect(view.notice).toBe("New system only. Older GHL Conversation AI history is hidden.");
  });

  it("counts the issues and points each one at its message", () => {
    const { issues } = charles();
    expect(issues.map((i) => `${i.anchor} ${i.label}`)).toEqual([
      "msg-c396 AI score 10",
      "msg-c414 Sent after out-of-area",
      "msg-c414 AI score 50",
      "msg-gX6ujXRHz75X9dqjtKU0S Sent after outbound paused",
      "msg-ga7Hudr47RJ7F7dnX8c0C Sent after outbound paused",
    ]);
  });

  it("writes the Why card text from the data", () => {
    expect(
      buildWhyText({
        firstName: "Charles",
        cause: "Opted out after",
        flaggedAt: ROWS[0]!.sent_at,
        flaggedScore: 10,
        optedOutAt: "2026-10-06T13:47:16.382+00:00",
        view: charles(),
      }),
    ).toBe(
      "Charles opted out the next morning. The bot told Charles the address is outside our service area (AI score 10), " +
        "then messages kept going out: an AI reply 20 minutes later, a workflow email that afternoon and a workflow text the next day.",
    );
  });
});

describe("buildConversation — cutoff", () => {
  const row: BotRow = { ...ROWS[2]!, context_id: 1, generated_at: "2026-10-05T14:00:00Z", sent_at: "2026-10-05T14:00:01Z" };
  const msg = (id: string, at: string): HlMessage => ({ ghl_message_id: id, direction: "inbound", type: "2", body: id, sent_at: at });

  it("hides a message 3 days before the first new-system message and keeps one 2 h before", () => {
    const view = buildConversation({
      messages: [msg("three-days", "2026-10-02T14:00:00Z"), msg("two-hours", "2026-10-05T12:00:00Z")],
      rows: [row],
      tagEvents: [],
      cutoverAt: "2026-09-11T19:00:00Z",
      mustReviewScoreBelow: 60,
    });
    const bodies = view.items.filter((i) => i.kind === "lead").map((i) => (i as { body: string }).body);
    expect(bodies).toEqual(["two-hours"]);
  });

  it("always hides a message before review_thread_cutover_at", () => {
    const view = buildConversation({
      messages: [msg("before-cutover", "2026-10-05T12:00:00Z")],
      rows: [row],
      tagEvents: [],
      cutoverAt: "2026-10-05T13:00:00Z",
      mustReviewScoreBelow: 60,
    });
    expect(view.items.some((i) => i.kind === "lead")).toBe(false);
  });
});

describe("matchBotMessages", () => {
  it("matches only the identical body sent within 120 s", () => {
    const body = "Is Tuesday at 2 PM still good?";
    const messages: HlMessage[] = [
      { ghl_message_id: "early", direction: "outbound", type: "2", body, sent_at: "2026-10-05T14:00:00Z" },
      { ghl_message_id: "late", direction: "outbound", type: "2", body: `  ${body.toUpperCase()} `, sent_at: "2026-10-05T14:10:00Z" },
    ];
    const rows: BotRow[] = [{ ...ROWS[2]!, context_id: 7, reply_text: body, sent_at: "2026-10-05T14:10:30Z" }];
    const m = matchBotMessages(messages, rows);
    expect([...m.keys()]).toEqual(["late"]);
  });
});

describe("queueIssueChips", () => {
  it("finds 'Sent after out-of-area' from bot rows and tag events alone", () => {
    expect(queueIssueChips(ROWS, TAGS)).toEqual(["Sent after out-of-area"]);
  });
});

describe("buildLeadStatus", () => {
  it("reads the bot, the service area and who can be reached from the current tags", () => {
    const s = buildLeadStatus({
      contact: { tags: ["agentic-active", "out-of-area", "suppress-outbound", "stop-bot", "dnc-sms"], city: "Edgewater", state: "FL", postal_code: "32132", source: "Internet" },
      lead: { disposition_label: "Canceled - Estimate", lead_source: "Internet", lp_branch_id: "JAX" },
      office: null,
      tagEvents: TAGS,
    });
    expect(s.bot).toBe("Stopped");
    expect(s.serviceArea).toEqual({ label: "Out of area", zip: "32132" });
    expect(s.reach).toEqual([
      { channel: "Text", allowed: false },
      { channel: "Phone call", allowed: false },
      { channel: "Email", allowed: true },
    ]);
    expect(s.warning).toBe("The bot was turned back on after this lead was marked out of area.");
  });
});

describe("createThumbsUp", () => {
  it("submits one Good review per click and hands back the id for Undo", async () => {
    const submit = vi.fn<QuickDeps["submit"]>(async () => ({ ok: true as const, data: { id: 91, uncalibrated: false } }));
    const onSaved = vi.fn();
    const thumbsUp = createThumbsUp({ submit, onSaved, onError: vi.fn() });
    const target = { contextId: 414, messageType: "reply" as const, messageRef: "ref-414", originalText: "Anytime." };
    await Promise.all([thumbsUp(target), thumbsUp(target)]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({ messageRef: "ref-414", draft: { verdict: "good", reasonCodes: [] } });
    expect(onSaved).toHaveBeenCalledWith(414, 91, false);
  });
});

describe("plainText", () => {
  it("matches a live-chat reply the mirror stored as workflow HTML", () => {
    const html =
      '<p style="margin:0px;"><span data-cv-variable="inboundWebhookRequest.message" data-cv-token="true">Got it. Email only. What&#39;s your best email address?</span></p>';
    const messages: HlMessage[] = [{ ghl_message_id: "h1", direction: "outbound", type: "29", body: html, sent_at: "2026-10-06T16:02:30Z" }];
    const rows: BotRow[] = [
      { ...ROWS[2]!, context_id: 9, channel: "live_chat", reply_text: "Got it. Email only. What's your best email address?", sent_at: "2026-10-06T16:02:29Z" },
    ];
    expect([...matchBotMessages(messages, rows).keys()]).toEqual(["h1"]);
    const bot = buildConversation({ messages, rows, tagEvents: [], cutoverAt: null, mustReviewScoreBelow: 60 }).items.find((i) => i.kind === "bot");
    expect(bot && "body" in bot ? bot.body : null).toBe("Got it. Email only. What's your best email address?");
  });
});

describe("buildWhyText — many sends after a stand-down", () => {
  it("summarizes past three messages instead of listing them", () => {
    const base = Date.parse("2026-10-05T15:00:00Z");
    const rows: BotRow[] = [0, 1, 2, 3].map((k) => ({
      ...ROWS[2]!,
      context_id: 100 + k,
      reply_text: `reply ${k}`,
      generated_at: new Date(base + (k + 1) * 60_000).toISOString(),
      sent_at: new Date(base + (k + 1) * 60_000).toISOString(),
      ai_score: 90,
    }));
    const view = buildConversation({
      messages: [],
      rows,
      tagEvents: [{ tag: "suppress-outbound", action: "add_tag", at: new Date(base + 30_000).toISOString() }],
      cutoverAt: null,
      mustReviewScoreBelow: 60,
    });
    expect(buildWhyText({ firstName: "Brian", cause: null, flaggedAt: null, flaggedScore: null, optedOutAt: null, view })).toBe(
      "Outbound messages were paused, then 4 messages kept going out: 4 AI replies, the last 4 minutes later.",
    );
  });
});

// ─── 2026-10-07: chip semantics, GHL tag history, grouping, sessions ──────


/*
 * Robert McKoy (GHL rRPO34Ooq0QmtSfXyqSw), read live 2026-10-07. Bodies
 * trimmed. The workflow text at 10:45 ET came BEFORE the 10:50 pause-workflow
 * tag; HARD_DISQUALIFIED_CLOSEOUT's suppress-outbound (09-22 21:28Z) was taken
 * off by GHL two minutes later, which only ghl_tag_inbox shows.
 */
const MCKOY_MESSAGES: HlMessage[] = [
  { ghl_message_id: "Wha", direction: "outbound", type: "2", sent_at: "2026-10-01T14:45:40.838Z", body: "Robert, the Reece team here. The 15-minute version is a phone call." },
  { ghl_message_id: "in1", direction: "inbound", type: "2", sent_at: "2026-10-01T14:49:00.013Z", body: "Your sales man told me you only sell vinyl windows." },
  { ghl_message_id: "yYb", direction: "outbound", type: "2", sent_at: "2026-10-01T14:50:35.837Z", body: "Robert, that's worth a straight answer. Brian from our team will follow up." },
  { ghl_message_id: "8Dd", direction: "outbound", type: "3", sent_at: "2026-10-01T19:45:54.021Z", body: "No rebook ask in this email." },
  { ghl_message_id: "DxU", direction: "outbound", type: "2", sent_at: "2026-10-02T13:45:59.984Z", body: "Robert, most homeowners never find out until someone looks." },
  { ghl_message_id: "Sbz", direction: "outbound", type: "2", sent_at: "2026-10-02T13:50:07.794Z", body: "We only build in vinyl, not aluminum." },
];
const MCKOY_ROWS: BotRow[] = [
  { context_id: 900, message_type: "reply", rule_applied: "AGENTIC_RESPOND_POST_CHATBOT", channel: "sms", skip_reason: null,
    reply_text: "Robert, that's worth a straight answer. Brian from our team will follow up.", inbound_text: null,
    generated_at: "2026-10-01T14:50:30.000Z", sent_at: "2026-10-01T14:50:36.000Z", ai_score: 80 },
  { context_id: 901, message_type: "reply", rule_applied: "AGENTIC_RESPOND_POST_CHATBOT", channel: "sms", skip_reason: null,
    reply_text: "We only build in vinyl, not aluminum.", inbound_text: null,
    generated_at: "2026-10-02T13:50:00.000Z", sent_at: "2026-10-02T13:50:08.000Z", ai_score: 80 },
];
const MCKOY_ACTION_TAGS: TagEvent[] = [
  { tag: "suppress-outbound", action: "add_tag", at: "2026-09-22T21:28:05.567Z" },
  { tag: "agentic-active", action: "add_tag", at: "2026-09-22T21:30:48.012Z" },
  { tag: "pause-workflow", action: "add_tag", at: "2026-10-01T14:50:25.716Z" },
];
const MCKOY_HISTORY = [
  { occurred_at: "2026-09-22T21:28:05.819Z", tags: ["suppress-outbound"] },
  { occurred_at: "2026-09-22T21:30:26.153Z", tags: ["agentic-active"] },
  { occurred_at: "2026-10-01T14:50:25.963Z", tags: ["agentic-active", "pause-workflow"] },
];

const mckoy = (tagEvents: TagEvent[]) =>
  buildConversation({ messages: MCKOY_MESSAGES, rows: MCKOY_ROWS, tagEvents, cutoverAt: "2026-09-11T19:00:00Z", mustReviewScoreBelow: 60 });
const chipsOf = (v: ReturnType<typeof mckoy>, anchor: string) => v.issues.filter((i) => i.anchor === anchor).map((i) => i.label);

describe("McKoy: chips follow event time, never pause-workflow for the bot", () => {
  it("the old read (our action log only) kept suppress-outbound on for two weeks", () => {
    const v = mckoy(MCKOY_ACTION_TAGS);
    expect(chipsOf(v, "msg-gWha")).toContain("Sent after outbound paused");
  });

  it("with GHL's history the pause ends at 21:30 on 09-22: the 10:45 message gets no chip", () => {
    const v = mckoy(mergeTagEvents(MCKOY_ACTION_TAGS, tagEventsFromHistory(MCKOY_HISTORY, THREAD_EVENT_TAGS)));
    expect(chipsOf(v, "msg-gWha")).toEqual([]);
  });

  it("pause-workflow counts from 10:50 for workflow messages, never for the bot", () => {
    const v = mckoy(mergeTagEvents(MCKOY_ACTION_TAGS, tagEventsFromHistory(MCKOY_HISTORY, THREAD_EVENT_TAGS)));
    expect(chipsOf(v, "msg-g8Dd")).toEqual(["Sent while paused"]);
    expect(chipsOf(v, "msg-gDxU")).toEqual(["Sent while paused"]);
    expect(chipsOf(v, "msg-c900")).toEqual([]);
    expect(chipsOf(v, "msg-c901")).toEqual([]);
    expect(v.issues.length).toBeLessThanOrEqual(4);
  });

  it("pause-workflow is never drawn as a line and never reaches the Why text", () => {
    const v = mckoy(MCKOY_ACTION_TAGS);
    expect(v.items.some((i) => i.kind === "event" && /drip/i.test(i.text))).toBe(false);
    expect(v.stateEvents.some((e) => /drip/i.test(e.text))).toBe(false);
  });

  it("a bot message after suppress-outbound still chips (the send gate's DQ class)", () => {
    const v = mckoy([{ tag: "suppress-outbound", action: "add_tag", at: "2026-10-01T14:46:00.000Z" }]);
    expect(chipsOf(v, "msg-c900")).toEqual(["Sent after outbound paused"]);
  });
});

describe("tagEventsFromHistory", () => {
  it("diffs consecutive tag sets for watched tags only, case-insensitive", () => {
    const ev = tagEventsFromHistory(
      [
        { occurred_at: "2026-10-01T10:00:00Z", tags: ["Stop-Bot", "random"] },
        { occurred_at: "2026-10-01T09:00:00Z", tags: [] },
        { occurred_at: "2026-10-01T11:00:00Z", tags: ["random"] },
      ],
      ["stop-bot"],
    );
    expect(ev).toEqual([
      { tag: "stop-bot", action: "add_tag", at: "2026-10-01T10:00:00Z" },
      { tag: "stop-bot", action: "remove_tag", at: "2026-10-01T11:00:00Z" },
    ]);
  });
});

describe("groupIssues", () => {
  it("one line per label with a count and the first anchor; rose wins", () => {
    const g = groupIssues([
      { label: "Sent after outbound paused", tone: "amber", anchor: "a" },
      { label: "Sent after outbound paused", tone: "amber", anchor: "b" },
      { label: "Sent after opt-out", tone: "rose", anchor: "c" },
      { label: "Sent after outbound paused", tone: "amber", anchor: "d" },
    ]);
    expect(g.map((x) => [x.label, x.count, x.anchors[0]])).toEqual([
      ["Sent after outbound paused", 3, "a"],
      ["Sent after opt-out", 1, "c"],
    ]);
  });
});

describe("sessions collapse", () => {
  const v = () => mckoy(mergeTagEvents(MCKOY_ACTION_TAGS, tagEventsFromHistory(MCKOY_HISTORY, THREAD_EVENT_TAGS)));

  it("groups items under their header; day dividers stay outside every session", () => {
    const blocks = toSessionBlocks(v().items);
    expect(blocks.some((b) => b.kind === "item" && b.item.kind === "day")).toBe(true);
    for (const b of blocks) if (b.kind === "session") expect(b.items.some((i) => i.kind === "day" || i.kind === "session")).toBe(false);
  });

  it("opens the selected message's session and its neighbours only", () => {
    const blocks = toSessionBlocks(v().items);
    const sessions = blocks.filter((b) => b.kind === "session");
    expect(sessions.length).toBeGreaterThanOrEqual(4);
    const open = defaultOpenSessions(blocks, "msg-c901");
    const idx = sessions.findIndex((b) => b.kind === "session" && b.anchors.includes("msg-c901"));
    expect(open.size).toBe(Math.min(sessions.length, idx + 2) - Math.max(0, idx - 1));
    expect(open.has((sessions[idx] as Extract<(typeof sessions)[number], { kind: "session" }>).header.key)).toBe(true);
    // No selection in the thread: the last three.
    expect(defaultOpenSessions(blocks, null).size).toBe(3);
  });

  it("the collapsed line reads label · n messages · start–end", () => {
    const s = toSessionBlocks(v().items).find((b) => b.kind === "session" && b.messageCount > 1);
    expect(s && s.kind === "session" ? collapsedSessionLine(s) : "").toMatch(/^.+ · \d+ messages · \d{1,2}:\d{2} [AP]M(–\d{1,2}:\d{2} [AP]M)?$/);
  });
});
