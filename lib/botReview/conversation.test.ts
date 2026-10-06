import { describe, expect, it, vi } from "vitest";
import {
  buildConversation,
  buildWhyText,
  matchBotMessages,
  queueIssueChips,
  timeEt,
  type BotRow,
  type ConvItem,
  type HlMessage,
  type TagEvent,
} from "./conversation";
import { buildLeadStatus } from "./leadStatus";
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
