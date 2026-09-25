/**
 * The review data must always be readable: every entry valid, ids unique,
 * meta counts true, and the stale rule right. A bad file fails here, not on
 * the page (index.ts drops it with a warning).
 */
import { describe, expect, it } from "vitest";
import data from "./data.json";
import meta from "./meta.json";
import { complianceFails, insightsMetaSchema, isStale, isSuspected, workflowInsightSchema } from "./schema";

describe("insights data", () => {
  it("every workflow entry parses and has unique step ids", () => {
    const ids = new Set<string>();
    for (const item of data) {
      const r = workflowInsightSchema.safeParse(item);
      expect(r.success, r.success ? "" : `${(item as { code?: string }).code}: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`).toBe(true);
      if (!r.success) continue;
      expect(ids.has(r.data.ghlWorkflowId), `duplicate ${r.data.code}`).toBe(false);
      ids.add(r.data.ghlWorkflowId);
      const steps = r.data.messages.map((m) => m.stepId);
      expect(new Set(steps).size).toBe(steps.length);
    }
  });

  it("meta counts match the data", () => {
    const m = insightsMetaSchema.parse(meta);
    expect(m.workflows).toBe(data.length);
    expect(m.messages).toBe(data.reduce((n, w) => n + (w as { messages: unknown[] }).messages.length, 0));
  });
});

describe("isStale", () => {
  it("is stale only when the live version moved past the reviewed one", () => {
    expect(isStale({ analysed_version: 12 }, 14)).toBe(true);
    expect(isStale({ analysed_version: 12 }, 12)).toBe(false);
    expect(isStale({ analysed_version: null }, 14)).toBe(false);
    expect(isStale({ analysed_version: 12 }, null)).toBe(false);
  });
});

describe("compliance and suspected classifications", () => {
  const base = {
    ghlWorkflowId: "abcdefgh12345",
    code: "S4.1",
    name: "S4.1 MV Booking",
    analysed_version: 70,
    analysed_at: "2026-09-25",
    journey_stage: "conversion",
    buyer_stage: 4,
    messages: [],
  };
  it("an offer or traffic call must say it is suspected until outcome data exists", () => {
    const why = (c: string, w: string) => workflowInsightSchema.safeParse({ ...base, summary: { strategy: "s", angle: "a", arcs: [], momentum_break: null, classification: c, why: w } });
    expect(why("offer", "The ask is weak.").success).toBe(false);
    expect(why("offer", "Suspected — the ask is weak; a booking rate under 5% would confirm it.").success).toBe(true);
    expect(why("messaging", "The copy pitches at stage 1.").success).toBe(true);
    expect(isSuspected({ summary: { classification: "traffic" } } as never)).toBe(true);
    expect(isSuspected({ summary: { classification: "messaging" } } as never)).toBe(false);
  });
  it("lists only the failed compliance checks, in a fixed order", () => {
    const c = { voice_channel: true, no_carrier_named: null, no_outcome_prediction: false, no_fake_scarcity: true, no_savings_promise: true, locked_terms: false, history_facts: null, stats_allowed: null, cta_review_first: null, voice_guardrails: false, crew_wording: null, parable_in_bank: null };
    expect(complianceFails(c)).toEqual(["no_outcome_prediction", "locked_terms", "voice_guardrails"]);
    expect(complianceFails(undefined)).toEqual([]);
  });
});
