import { describe, it, expect } from "vitest";
import {
  validateDraft,
  emptyDraft,
  showsReasons,
  reasonsForType,
  effectiveRewrite,
  visibleTabs,
  resolveTab,
  canReview,
  canStopBot,
  canApprove,
  buildQueuePlan,
  resolveLane,
  canRetract,
  canUndoDismiss,
  canSeeOtherReviewers,
  canSeeRetracted,
  LANES,
  DEFAULT_LANE,
  TABS,
  scoreTone,
  queueSignal,
  enoughData,
  ratePct,
  PAGE_SIZE,
  contactLabel,
  contactNameOnly,
  groupByContact,
  findConversation,
  buildTimeline,
  type FeedbackDraft,
} from "./core";

const draft = (over: Partial<FeedbackDraft> = {}): FeedbackDraft => ({ ...emptyDraft, ...over });

// ─── verdict validation (handoff §7) ────────────────────────────────

describe("validateDraft", () => {
  it("blocks submit until a verdict is picked", () => {
    expect(validateDraft(draft())).toEqual({
      field: "verdict",
      message: "Pick Good, Needs work, or Unsafe.",
    });
  });

  it("lets a plain Good through with nothing else filled in", () => {
    expect(validateDraft(draft({ verdict: "good" }))).toBeNull();
  });

  it("requires a reason on Needs work, pointing at the chips", () => {
    const err = validateDraft(draft({ verdict: "needs_work" }));
    expect(err?.field).toBe("reason_codes");
    expect(err?.message).toBe("Pick at least one reason before you submit.");
  });

  it("requires a reason on Unsafe too", () => {
    expect(validateDraft(draft({ verdict: "unsafe", note: "bad" }))?.field).toBe("reason_codes");
  });

  it("requires a note on Unsafe, with the design's exact helper text", () => {
    const err = validateDraft(draft({ verdict: "unsafe", reasonCodes: ["compliance"] }));
    expect(err?.field).toBe("note");
    expect(err?.message).toBe("A note is required on Unsafe. Tell us what could go wrong.");
  });

  it("does not accept whitespace as a note on Unsafe", () => {
    expect(
      validateDraft(draft({ verdict: "unsafe", reasonCodes: ["compliance"], note: "   " }))?.field,
    ).toBe("note");
  });

  it("does not require a note on Needs work", () => {
    expect(validateDraft(draft({ verdict: "needs_work", reasonCodes: ["tone_voice"] }))).toBeNull();
  });

  it("allows gold only on Good", () => {
    expect(validateDraft(draft({ verdict: "good", gold: true }))).toBeNull();
    expect(
      validateDraft(draft({ verdict: "needs_work", reasonCodes: ["tone_voice"], gold: true }))?.field,
    ).toBe("gold");
  });

  it("accepts a fully filled Unsafe", () => {
    expect(
      validateDraft(draft({ verdict: "unsafe", reasonCodes: ["compliance"], note: "Named a carrier." })),
    ).toBeNull();
  });
});

describe("showsReasons", () => {
  it("reveals the chips only once something went wrong", () => {
    expect(showsReasons(null)).toBe(false);
    expect(showsReasons("good")).toBe(false);
    expect(showsReasons("needs_work")).toBe(true);
    expect(showsReasons("unsafe")).toBe(true);
  });
});

describe("reasonsForType", () => {
  const all = [
    { code: "dodged_question" },
    { code: "should_have_replied" },
    { code: "tone_voice" },
  ];

  it("hides the inbound-only reasons on nurture", () => {
    // Nurture answers no inbound, so these two could never be acted on.
    expect(reasonsForType(all, "nurture").map((r) => r.code)).toEqual(["tone_voice"]);
  });

  it("keeps every reason on replies and skips", () => {
    expect(reasonsForType(all, "reply")).toHaveLength(3);
    expect(reasonsForType(all, "skip")).toHaveLength(3);
  });
});

describe("effectiveRewrite", () => {
  const original = "Every home is different, so pricing depends on many factors.";

  it("ignores an untouched pre-filled box", () => {
    // The box ships pre-filled; submitting it as-is is not a correction.
    expect(effectiveRewrite(original, original)).toBeNull();
    expect(effectiveRewrite(`  ${original}  `, original)).toBeNull();
  });

  it("keeps a real edit", () => {
    expect(effectiveRewrite("Most 12-window jobs land in the $18–24k range.", original)).toBe(
      "Most 12-window jobs land in the $18–24k range.",
    );
  });

  it("treats an emptied box as no rewrite", () => {
    expect(effectiveRewrite("   ", original)).toBeNull();
  });

  it("keeps a rewrite when the bot said nothing (a skip)", () => {
    expect(effectiveRewrite("We do — impact-rated French doors.", null)).toBe(
      "We do — impact-rated French doors.",
    );
  });
});

// ─── permission gating (handoff §7) ─────────────────────────────────

describe("tab access", () => {
  const operator = { role: "operator" as const, isAdmin: false, isExecOnly: false };
  const admin = { role: "operator" as const, isAdmin: true, isExecOnly: false };
  const team = { role: "team" as const, isAdmin: false, isExecOnly: false };
  const execOnly = { role: "team" as const, isAdmin: false, isExecOnly: true };

  it("gives operators and admins every tab", () => {
    expect(visibleTabs(operator)).toHaveLength(TABS.length);
    expect(visibleTabs(admin)).toHaveLength(TABS.length);
  });

  it("limits team to Review, Completed and Compare", () => {
    // Completed is their OWN work. Hiding it would mean a team member could
    // not find, edit or remove a review they had just submitted.
    expect(visibleTabs(team)).toEqual(["review", "completed", "compare"]);
  });

  it("offers Completed to everyone who may review", () => {
    expect(visibleTabs(operator)).toContain("completed");
    expect(visibleTabs(team)).toContain("completed");
    expect(visibleTabs(execOnly)).not.toContain("completed");
    expect(resolveTab("completed", team)).toBe("completed");
  });

  it("gives exec-only nothing", () => {
    expect(visibleTabs(execOnly)).toEqual([]);
  });

  it("redirects a team member away from a tab they cannot see", () => {
    expect(resolveTab("scoreboard", team)).toBe("review");
    expect(resolveTab("fixes", team)).toBe("review");
    expect(resolveTab("compare", team)).toBe("compare");
  });

  it("falls back to review on junk or absent tab values", () => {
    expect(resolveTab(null, operator)).toBe("review");
    expect(resolveTab("nonsense", operator)).toBe("review");
  });

  it("lets operators open every tab they asked for", () => {
    expect(resolveTab("scoreboard", operator)).toBe("scoreboard");
  });
});

describe("action gating", () => {
  const operator = { role: "operator" as const, isAdmin: false, isExecOnly: false };
  const admin = { role: "operator" as const, isAdmin: true, isExecOnly: false };
  const team = { role: "team" as const, isAdmin: false, isExecOnly: false };
  const execOnly = { role: "team" as const, isAdmin: false, isExecOnly: true };

  it("lets an uncalibrated team member review — otherwise they could never calibrate", () => {
    expect(canReview(team)).toBe(true);
    expect(canReview(operator)).toBe(true);
    expect(canReview(execOnly)).toBe(false);
  });

  it("keeps stop-bot to operators and admins", () => {
    expect(canStopBot(team)).toBe(false);
    expect(canStopBot(operator)).toBe(true);
    expect(canStopBot(admin)).toBe(true);
  });

  it("keeps approval to admins", () => {
    expect(canApprove(operator)).toBe(false);
    expect(canApprove(admin)).toBe(true);
  });
});

// ─── queue query builder (handoff §7) ───────────────────────────────

describe("buildQueuePlan", () => {
  it("defaults to riskiest-first and the first page of 25", () => {
    const p = buildQueuePlan({ lane: "everything" });
    expect(p.order[0]).toEqual({ column: "priority", ascending: true });
    expect(p.order[1]).toEqual({ column: "generated_at", ascending: false });
    expect(p.range).toEqual([0, PAGE_SIZE - 1]);
  });

  it("pages correctly", () => {
    expect(buildQueuePlan({ lane: "everything", page: 2 }).range).toEqual([25, 49]);
    expect(buildQueuePlan({ lane: "everything", page: 3 }).range).toEqual([50, 74]);
    // A junk page never produces a negative range.
    expect(buildQueuePlan({ lane: "everything", page: 0 }).range).toEqual([0, 24]);
    expect(buildQueuePlan({ lane: "everything", page: -5 }).range).toEqual([0, 24]);
  });

  it("maps each saved view to the filter it promises", () => {
    const ev = (view: string) => buildQueuePlan({ lane: "everything", view });
    expect(ev("silent").eq).toContainEqual(["message_type", "skip"]);
    expect(ev("optedout").notNull).toContain("opted_out_at");
    expect(ev("lowscore").lt).toContainEqual(["ai_score", 60]);
    expect(ev("unreviewed").eq).toContainEqual(["review_count", "0"]);
    expect(ev("price").in[0]?.[1]).toContain("OBJ_PRICE_STRIKE1");
  });

  it("riskiest first adds no filter — it is the default order, not a subset", () => {
    const p = buildQueuePlan({ lane: "everything", view: "riskiest" });
    expect(p.eq).toHaveLength(0);
    expect(p.notNull).toHaveLength(0);
    expect(p.lt).toHaveLength(0);
  });

  it("maps the type filter onto message_type", () => {
    const ev = (type: string) => buildQueuePlan({ lane: "everything", type });
    expect(ev("replies").eq).toContainEqual(["message_type", "reply"]);
    expect(ev("nurture").eq).toContainEqual(["message_type", "nurture"]);
    expect(ev("skipped").eq).toContainEqual(["message_type", "skip"]);
  });

  it("maps outcomes to presence or absence, not to equality", () => {
    const ev = (outcome: string) => buildQueuePlan({ lane: "everything", outcome });
    expect(ev("booked").notNull).toContain("booked_at");
    expect(ev("no_reply").isNull).toContain("replied_at");
    expect(ev("opted_out").notNull).toContain("opted_out_at");
  });

  it("treats 'all' as no filter at all", () => {
    const p = buildQueuePlan({ lane: "everything", channel: "all", office: "all", rule: "all", type: "all", outcome: "all", date: "all" });
    expect(p.eq).toHaveLength(0);
    expect(p.notNull).toHaveLength(0);
    expect(p.gte).toHaveLength(0);
  });

  it("turns a date window into a lower bound from a fixed clock", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    expect(buildQueuePlan({ lane: "everything", date: "today" }, now).gte[0]?.[1]).toBe("2026-09-10T12:00:00.000Z");
    expect(buildQueuePlan({ lane: "everything", date: "7d" }, now).gte[0]?.[1]).toBe("2026-09-04T12:00:00.000Z");
  });

  it("combines filters rather than letting the last one win", () => {
    const p = buildQueuePlan({ lane: "everything", view: "lowscore", channel: "sms", type: "replies", page: 2 });
    expect(p.lt).toContainEqual(["ai_score", 60]);
    expect(p.eq).toContainEqual(["channel", "sms"]);
    expect(p.eq).toContainEqual(["message_type", "reply"]);
    expect(p.range).toEqual([25, 49]);
  });
});

// ─── display helpers ────────────────────────────────────────────────

describe("scoreTone", () => {
  it("uses the design's thresholds", () => {
    expect(scoreTone(91)).toBe("emerald");
    expect(scoreTone(80)).toBe("emerald");
    expect(scoreTone(79)).toBe("amber");
    expect(scoreTone(60)).toBe("amber");
    expect(scoreTone(58)).toBe("rose");
  });

  it("treats an unscored message as neutral, never as bad", () => {
    expect(scoreTone(null)).toBe("slate");
    expect(scoreTone(undefined)).toBe("slate");
  });
});

describe("queueSignal", () => {
  it("lets the outcome outrank the score", () => {
    // A message that got someone to opt out is not a 91.
    expect(queueSignal({ opted_out_at: "2026-09-11T00:00:00Z", ai_score: 91 })).toEqual({
      label: "Opted out after",
      tone: "rose",
    });
  });

  it("calls a skip what it is", () => {
    expect(queueSignal({ message_type: "skip", ai_score: null }).label).toBe("Bot stayed silent");
  });

  it("distinguishes unscored from low-scored", () => {
    expect(queueSignal({ message_type: "reply", ai_score: null }).label).toBe("Not scored yet");
    expect(queueSignal({ message_type: "reply", ai_score: 58 })).toEqual({
      label: "AI score 58",
      tone: "rose",
    });
  });
});

describe("honest numbers", () => {
  it("hides a rate built on fewer than 30 reviews", () => {
    expect(enoughData(29)).toBe(false);
    expect(enoughData(30)).toBe(true);
    expect(enoughData(null)).toBe(false);
    expect(ratePct(0.74, 12)).toBeNull();
    expect(ratePct(0.74, 86)).toBe("74%");
  });

  it("hides a missing rate even when the sample is large", () => {
    expect(ratePct(null, 100)).toBeNull();
  });
});

// ─── contact identity ───────────────────────────────────────────────

describe("contactLabel", () => {
  it("leads with the person's name and their city", () => {
    expect(contactLabel({ contact_name: "Alfredo Fontan", contact_city: "Orlando", office: "ORL_MKT" }))
      .toBe("Alfredo Fontan · Orlando");
  });

  it("prefers the real city to the internal market code", () => {
    // ORL_MKT is a routing label, not somewhere a person lives.
    expect(contactLabel({ contact_name: "Maritza Rodriguez", contact_city: "Orlando", office: "ORL_MKT" }))
      .toContain("Orlando");
    expect(contactLabel({ contact_name: "Maritza Rodriguez", contact_city: "Orlando", office: "ORL_MKT" }))
      .not.toContain("ORL_MKT");
  });

  it("falls back to the market when there is no city", () => {
    expect(contactLabel({ contact_name: "Greg Hansen", contact_city: null, office: "ORL_MKT" }))
      .toBe("Greg Hansen · ORL_MKT");
  });

  it("degrades to the old label when the lead has not resolved", () => {
    // A GHL contact with no LP lead yet must still render a usable row.
    expect(contactLabel({ contact_name: null, contact_city: null, office: "ORL_MKT" })).toBe("Lead · ORL_MKT");
    expect(contactLabel({ contact_name: null, contact_city: null, office: null })).toBe("Lead");
  });

  it("ignores whitespace-only names", () => {
    expect(contactLabel({ contact_name: "   ", contact_city: "Tampa" })).toBe("Lead · Tampa");
  });

  it("shows a bare name when there is no location at all", () => {
    expect(contactLabel({ contact_name: "Mark Test" })).toBe("Mark Test");
  });
});

describe("contactNameOnly", () => {
  it("returns just the person, for places already showing the location", () => {
    expect(contactNameOnly({ contact_name: "Alfredo Fontan" })).toBe("Alfredo Fontan");
  });

  it("says so plainly when the name is missing", () => {
    expect(contactNameOnly({ contact_name: null })).toBe("Unnamed lead");
    expect(contactNameOnly({ contact_name: "  " })).toBe("Unnamed lead");
  });
});

// ─── conversations ──────────────────────────────────────────────────

const row = (over: Record<string, unknown> = {}) => ({
  context_id: 1,
  ghl_contact_id: "abc",
  channel: "sms",
  message_type: "reply",
  generated_at: "2026-09-10T12:00:00Z",
  sent_at: null,
  review_count: 0,
  ...over,
}) as Parameters<typeof groupByContact>[0][number];

describe("groupByContact", () => {
  it("folds every message to one contact into a single conversation", () => {
    const groups = groupByContact([
      row({ context_id: 1, generated_at: "2026-09-10T12:00:00Z" }),
      row({ context_id: 2, generated_at: "2026-09-11T09:00:00Z" }),
      row({ context_id: 3, generated_at: "2026-09-09T08:00:00Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.messageCount).toBe(3);
    expect(groups[0]!.latestAt).toBe("2026-09-11T09:00:00Z");
  });

  it("keeps the view's priority order — a conversation sits where its first message sat", () => {
    const groups = groupByContact([
      row({ context_id: 1, ghl_contact_id: "bbb" }),
      row({ context_id: 2, ghl_contact_id: "aaa" }),
      row({ context_id: 3, ghl_contact_id: "bbb" }),
    ]);
    expect(groups.map((g) => g.contactId)).toEqual(["bbb", "aaa"]);
  });

  it("counts only the messages still to review", () => {
    const groups = groupByContact([
      row({ context_id: 1, review_count: 2 }),
      row({ context_id: 2, review_count: 0 }),
      row({ context_id: 3, review_count: 0 }),
    ]);
    expect(groups[0]!.messageCount).toBe(3);
    expect(groups[0]!.unreviewedCount).toBe(2);
  });

  it("never merges two leads that have no contact id", () => {
    const groups = groupByContact([
      row({ context_id: 1, ghl_contact_id: null }),
      row({ context_id: 2, ghl_contact_id: null }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("collects the channels the conversation actually used, without repeats", () => {
    const groups = groupByContact([
      row({ context_id: 1, channel: "sms" }),
      row({ context_id: 2, channel: "email" }),
      row({ context_id: 3, channel: "sms" }),
    ]);
    expect(groups[0]!.channels).toEqual(["sms", "email"]);
  });

  it("takes its headline signal from the highest-priority message in the group", () => {
    const groups = groupByContact([
      row({ context_id: 1, message_type: "skip" }),
      row({ context_id: 2, ai_score: 95 }),
    ]);
    expect(groups[0]!.signal.label).toBe("Bot stayed silent");
  });
});

describe("findConversation", () => {
  it("finds the conversation a message belongs to", () => {
    const groups = groupByContact([row({ context_id: 1 }), row({ context_id: 2, ghl_contact_id: "zzz" })]);
    expect(findConversation(groups, 2)!.contactId).toBe("zzz");
    expect(findConversation(groups, 99)).toBeNull();
    expect(findConversation(groups, null)).toBeNull();
  });
});

describe("buildTimeline", () => {
  const snap = (turns: Array<{ direction: string; body: string; at: string }>) => turns;

  it("puts the lead's turns and the bot's messages on one clock, oldest first", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: "We can do Tuesday.", generated_at: "2026-09-10T12:05:00Z" }],
      new Map([[1, snap([{ direction: "inbound", body: "Are you open?", at: "2026-09-10T12:00:00Z" }])]]),
    );
    expect(items.map((i) => i.kind)).toEqual(["turn", "message"]);
  });

  it("shows a reply once, not again as a plain turn in the next message's snapshot", () => {
    const items = buildTimeline(
      [
        { context_id: 1, reply_text: "We can do Tuesday.", generated_at: "2026-09-10T12:05:00Z" },
        { context_id: 2, reply_text: "Still free Tuesday?", generated_at: "2026-09-11T12:00:00Z" },
      ],
      new Map([
        [1, snap([{ direction: "inbound", body: "Are you open?", at: "2026-09-10T12:00:00Z" }])],
        [
          2,
          snap([
            { direction: "inbound", body: "Are you open?", at: "2026-09-10T12:00:00Z" },
            { direction: "outbound", body: "We can do Tuesday.", at: "2026-09-10T12:05:00Z" },
          ]),
        ],
      ]),
    );
    expect(items.filter((i) => i.kind === "turn")).toHaveLength(1);
    expect(items.filter((i) => i.kind === "message")).toHaveLength(2);
  });

  it("ignores whitespace and case when deciding two turns are the same", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: "We can  do TUESDAY.", generated_at: "2026-09-10T12:05:00Z" }],
      new Map([[1, snap([{ direction: "outbound", body: "we can do tuesday.", at: "2026-09-10T12:05:00Z" }])]]),
    );
    expect(items.filter((i) => i.kind === "turn")).toHaveLength(0);
  });

  it("keeps two identical lead messages sent at different times", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: null, generated_at: "2026-09-10T13:00:00Z" }],
      new Map([
        [
          1,
          snap([
            { direction: "inbound", body: "hello?", at: "2026-09-10T12:00:00Z" },
            { direction: "inbound", body: "hello?", at: "2026-09-10T12:30:00Z" },
          ]),
        ],
      ]),
    );
    expect(items.filter((i) => i.kind === "turn")).toHaveLength(2);
  });

  it("dates a message by when it was sent, falling back to when it was generated", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: "hi", sent_at: "2026-09-10T12:09:00Z", generated_at: "2026-09-10T12:05:00Z" }],
      new Map(),
    );
    expect((items[0] as { at: string }).at).toBe("2026-09-10T12:09:00Z");
  });

  it("keeps an undated turn rather than dropping part of what the bot read", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: "hi", generated_at: "2026-09-10T12:05:00Z" }],
      new Map([[1, [{ direction: "inbound", body: "no timestamp", at: null }]]]),
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.kind).toBe("turn");
  });

  /*
   * The defect this pins: an undated turn used to become "" and sort before
   * every real timestamp, so the lead's whole side of the conversation landed
   * in one block above the bot's. It belongs with the message that captured
   * it, immediately before that message.
   */
  it("puts an undated turn beside the message whose snapshot captured it, not at the top", () => {
    const items = buildTimeline(
      [
        { context_id: 1, reply_text: "We can do Tuesday.", generated_at: "2026-09-10T12:05:00Z" },
        { context_id: 2, reply_text: "Still free Tuesday?", generated_at: "2026-09-11T12:00:00Z" },
      ],
      new Map([
        [1, [{ direction: "inbound", body: "Are you open?", at: "2026-09-10T12:00:00Z" }]],
        [
          2,
          [
            { direction: "inbound", body: "Are you open?", at: "2026-09-10T12:00:00Z" },
            { direction: "inbound", body: "sorry, missed this", at: null },
          ],
        ],
      ]),
    );
    expect(items.map((i) => i.kind)).toEqual(["turn", "message", "turn", "message"]);
    expect((items[0] as { body: string }).body).toBe("Are you open?");
    expect((items[2] as { body: string }).body).toBe("sorry, missed this");
  });

  /*
   * Snapshot turns and queue rows come from different writers, so the same
   * instant arrives in two shapes. localeCompare put these hours apart.
   */
  it("orders by the true instant when offsets differ, not by how the timestamp is spelled", () => {
    const items = buildTimeline(
      [{ context_id: 1, reply_text: "on our way", sent_at: "2026-09-11T19:36:00Z", generated_at: "2026-09-11T19:30:00Z" }],
      new Map([
        [
          1,
          [
            // 18:36Z — an hour before the reply, written in local time.
            { direction: "inbound", body: "before the reply", at: "2026-09-11 14:36:00-04:00" },
            // 20:36Z — an hour AFTER the reply, also written in local time.
            // Compared as strings a space sorts before "T", so this one used
            // to jump ahead of a reply it actually followed.
            { direction: "inbound", body: "after the reply", at: "2026-09-11 16:36:00-04:00" },
          ],
        ],
      ]),
    );
    expect(items.map((i) => i.kind)).toEqual(["turn", "message", "turn"]);
    expect((items[0] as { body: string }).body).toBe("before the reply");
    expect((items[2] as { body: string }).body).toBe("after the reply");
  });
});

// ─── review lanes (increment 2 §6A) ─────────────────────────────────

describe("review lanes", () => {
  it("defaults to Must review and falls back rather than throwing", () => {
    expect(DEFAULT_LANE).toBe("must_review");
    expect(resolveLane(null)).toBe("must_review");
    expect(resolveLane(undefined)).toBe("must_review");
    expect(resolveLane("")).toBe("must_review");
    // A hand-typed or stale URL lands somewhere usable instead of 404ing.
    expect(resolveLane("nonsense")).toBe("must_review");
  });

  it("honours each real lane", () => {
    for (const l of LANES) expect(resolveLane(l.key)).toBe(l.key);
  });

  it("filters a work lane to open, undismissed, unreviewed messages", () => {
    // All three conditions, or the lane is a to-do list that never empties.
    for (const lane of ["must_review", "spot_check"]) {
      const p = buildQueuePlan({ lane });
      expect(p.eq).toContainEqual(["review_lane", lane]);
      expect(p.eq).toContainEqual(["review_count", "0"]);
      expect(p.is).toContainEqual(["dismissed", false]);
    }
  });

  it("leaves Everything unfiltered — it is a lookup, not a queue", () => {
    const p = buildQueuePlan({ lane: "everything" });
    expect(p.eq).toHaveLength(0);
    expect(p.is).toHaveLength(0);
  });

  it("keeps riskiest-first ordering in every lane", () => {
    for (const l of LANES) {
      const p = buildQueuePlan({ lane: l.key });
      expect(p.order[0]).toEqual({ column: "priority", ascending: true });
      expect(p.order[1]).toEqual({ column: "generated_at", ascending: false });
    }
  });

  it("keeps every existing filter working inside a lane", () => {
    const p = buildQueuePlan({ lane: "spot_check", channel: "sms", type: "replies", office: "ORL_MKT", page: 2 });
    expect(p.eq).toContainEqual(["review_lane", "spot_check"]);
    expect(p.eq).toContainEqual(["channel", "sms"]);
    expect(p.eq).toContainEqual(["message_type", "reply"]);
    expect(p.eq).toContainEqual(["office", "ORL_MKT"]);
    expect(p.range).toEqual([25, 49]);
  });

  /*
   * The stability guarantee, from this side of the wire.
   *
   * The hash itself lives in sql/106 and depends only on (message_type,
   * message_ref). What the query builder must never do is add a term that
   * makes lane membership depend on data that arrives later — a score, an
   * outcome, a review count on the message itself. If it did, a message would
   * move between lanes when an outcome landed and the "random sample" would
   * quietly become "messages whose outcomes arrived early".
   */
  it("asks for a lane by name only — never by score or outcome", () => {
    const before = buildQueuePlan({ lane: "spot_check" });
    const after = buildQueuePlan({ lane: "spot_check" });
    expect(after).toEqual(before);

    const laneTerms = before.eq.filter(([col]) => col === "review_lane");
    expect(laneTerms).toEqual([["review_lane", "spot_check"]]);
    // Nothing outcome-shaped leaks into how the lane is selected.
    for (const col of [...before.notNull, ...before.isNull]) {
      expect(["ai_score", "replied_at", "booked_at", "opted_out_at"]).not.toContain(col);
    }
    expect(before.lt).toHaveLength(0);
  });

  it("does not re-rank the queue when outcome filters are added", () => {
    // Same lane, extra filter: the ORDER must be untouched, so a message's
    // position comes from priority alone and not from what a filter implies.
    const plain = buildQueuePlan({ lane: "must_review" });
    const filtered = buildQueuePlan({ lane: "must_review", outcome: "booked" });
    expect(filtered.order).toEqual(plain.order);
  });
});

// ─── retraction and dismissal permissions (increment 2 §6C, §6D) ────

describe("retraction and dismissal permissions", () => {
  const author = { email: "kim@reecewindows.com", isAdmin: false };
  const other = { email: "sam@reecewindows.com", isAdmin: false };
  const admin = { email: "mark@reecewindows.com", isAdmin: true };
  const review = { reviewer_email: "Kim@ReeceWindows.com" };

  it("lets the author and any admin remove a review, and nobody else", () => {
    // Case-insensitive: kim@ and Kim@ are one person, and the author must not
    // be locked out of their own review by how they typed their address.
    expect(canRetract(author, review)).toBe(true);
    expect(canRetract(admin, review)).toBe(true);
    expect(canRetract(other, review)).toBe(false);
  });

  it("has nothing to remove when there is no review", () => {
    expect(canRetract(admin, null)).toBe(false);
    expect(canRetract(author, undefined)).toBe(false);
  });

  it("keeps undoing a dismissal narrower than making one", () => {
    // Dismissing hides one message; undoing puts it back for everyone.
    expect(canUndoDismiss({ role: "team", isAdmin: false })).toBe(false);
    expect(canUndoDismiss({ role: "operator", isAdmin: false })).toBe(true);
    expect(canUndoDismiss({ role: "team", isAdmin: true })).toBe(true);
  });

  it("shows other people's reviews only to operators and admins", () => {
    expect(canSeeOtherReviewers({ role: "team", isAdmin: false })).toBe(false);
    expect(canSeeOtherReviewers({ role: "operator", isAdmin: false })).toBe(true);
    expect(canSeeOtherReviewers({ role: "team", isAdmin: true })).toBe(true);
  });

  it("keeps the retracted audit list admin-only", () => {
    expect(canSeeRetracted({ isAdmin: false })).toBe(false);
    expect(canSeeRetracted({ isAdmin: true })).toBe(true);
  });
});

// ─── plain-English feedback controls (increment 2 §6B) ──────────────

describe("plain-English feedback controls", () => {
  it("has no seenBefore field left on the draft", () => {
    expect(Object.keys(emptyDraft)).not.toContain("seenBefore");
    expect(Object.keys(emptyDraft).sort()).toEqual(
      ["betterText", "gold", "note", "reasonCodes", "verdict"],
    );
  });

  it("rejects a teaching example on anything but Good, in words a reviewer reads", () => {
    const bad = validateDraft(draft({ verdict: "needs_work", reasonCodes: ["tone_voice"], gold: true }));
    expect(bad?.field).toBe("gold");
    expect(bad?.message).toBe("Only a Good message can be used as a teaching example.");
    expect(bad?.message).not.toMatch(/gold/i);
  });

  it("still allows a teaching example on Good", () => {
    expect(validateDraft(draft({ verdict: "good", gold: true }))).toBeNull();
  });
});
