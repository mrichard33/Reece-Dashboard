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
  scoreTone,
  queueSignal,
  enoughData,
  ratePct,
  PAGE_SIZE,
  contactLabel,
  contactNameOnly,
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
    expect(visibleTabs(operator)).toHaveLength(5);
    expect(visibleTabs(admin)).toHaveLength(5);
  });

  it("limits team to Review and Compare", () => {
    expect(visibleTabs(team)).toEqual(["review", "compare"]);
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
    const p = buildQueuePlan({});
    expect(p.order[0]).toEqual({ column: "priority", ascending: true });
    expect(p.order[1]).toEqual({ column: "generated_at", ascending: false });
    expect(p.range).toEqual([0, PAGE_SIZE - 1]);
  });

  it("pages correctly", () => {
    expect(buildQueuePlan({ page: 2 }).range).toEqual([25, 49]);
    expect(buildQueuePlan({ page: 3 }).range).toEqual([50, 74]);
    // A junk page never produces a negative range.
    expect(buildQueuePlan({ page: 0 }).range).toEqual([0, 24]);
    expect(buildQueuePlan({ page: -5 }).range).toEqual([0, 24]);
  });

  it("maps each saved view to the filter it promises", () => {
    expect(buildQueuePlan({ view: "silent" }).eq).toContainEqual(["message_type", "skip"]);
    expect(buildQueuePlan({ view: "optedout" }).notNull).toContain("opted_out_at");
    expect(buildQueuePlan({ view: "lowscore" }).lt).toContainEqual(["ai_score", 60]);
    expect(buildQueuePlan({ view: "unreviewed" }).eq).toContainEqual(["review_count", "0"]);
    expect(buildQueuePlan({ view: "price" }).in[0]?.[1]).toContain("OBJ_PRICE_STRIKE1");
  });

  it("riskiest first adds no filter — it is the default order, not a subset", () => {
    const p = buildQueuePlan({ view: "riskiest" });
    expect(p.eq).toHaveLength(0);
    expect(p.notNull).toHaveLength(0);
    expect(p.lt).toHaveLength(0);
  });

  it("maps the type filter onto message_type", () => {
    expect(buildQueuePlan({ type: "replies" }).eq).toContainEqual(["message_type", "reply"]);
    expect(buildQueuePlan({ type: "nurture" }).eq).toContainEqual(["message_type", "nurture"]);
    expect(buildQueuePlan({ type: "skipped" }).eq).toContainEqual(["message_type", "skip"]);
  });

  it("maps outcomes to presence or absence, not to equality", () => {
    expect(buildQueuePlan({ outcome: "booked" }).notNull).toContain("booked_at");
    expect(buildQueuePlan({ outcome: "no_reply" }).isNull).toContain("replied_at");
    expect(buildQueuePlan({ outcome: "opted_out" }).notNull).toContain("opted_out_at");
  });

  it("treats 'all' as no filter at all", () => {
    const p = buildQueuePlan({ channel: "all", office: "all", rule: "all", type: "all", outcome: "all", date: "all" });
    expect(p.eq).toHaveLength(0);
    expect(p.notNull).toHaveLength(0);
    expect(p.gte).toHaveLength(0);
  });

  it("turns a date window into a lower bound from a fixed clock", () => {
    const now = new Date("2026-09-11T12:00:00Z");
    expect(buildQueuePlan({ date: "today" }, now).gte[0]?.[1]).toBe("2026-09-10T12:00:00.000Z");
    expect(buildQueuePlan({ date: "7d" }, now).gte[0]?.[1]).toBe("2026-09-04T12:00:00.000Z");
  });

  it("combines filters rather than letting the last one win", () => {
    const p = buildQueuePlan({ view: "lowscore", channel: "sms", type: "replies", page: 2 });
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
