/**
 * Strategy insights (2026-09-25): a hand-reviewed reading of every message
 * in every published sending workflow against the Antifragile Sales System
 * buyer stages. Stored as JSON in this folder (one file per workflow),
 * validated by this schema, shown on the workflow page ("Strategy" tab and
 * card) and on /workflows/review.
 *
 * The analysis is a snapshot: `analysed_version` is the GHL workflow
 * version it was read at, so the UI can say "workflow has changed since".
 */
import { z } from "zod";

/** Antifragile buyer stages: 1 Indifferent · 2 Curious · 3 Comparing · 4 Negotiating · 5 Committed. */
export const buyerStageSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type BuyerStage = z.infer<typeof buyerStageSchema>;

export const BUYER_STAGE_LABEL: Record<BuyerStage, string> = {
  1: "Indifferent — doesn't feel the problem yet",
  2: "Curious — exploring the problem and solutions",
  3: "Comparing — weighing us against alternatives",
  4: "Negotiating — decided, not yet committed",
  5: "Committed — a customer",
};

export const journeyStageSchema = z.enum(["awareness", "indoctrination", "positioning", "conversion", "reactivation", "post-sale", "support", "infrastructure"]);
export type JourneyStage = z.infer<typeof journeyStageSchema>;

/** The progression the team asked us to check, in order. */
export const leverSchema = z.enum(["relevance", "curiosity", "hope", "rapport", "engagement", "positioning", "urgency", "none"]);
export type Lever = z.infer<typeof leverSchema>;

export const verdictSchema = z.enum(["ok", "early_pitch", "over_educating", "premature_positioning", "no_reason_to_act", "off_voice", "other"]);
export type Verdict = z.infer<typeof verdictSchema>;

export const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "Doing its job",
  early_pitch: "Pitching too early",
  over_educating: "Teaching someone who is ready",
  premature_positioning: "Positioning before they compare",
  no_reason_to_act: "No reason to act now",
  off_voice: "Off voice or off rules",
  other: "Other issue",
};

/**
 * Brand and compliance checks, each its own pass/fail (Mark, 2026-09-25):
 * a message can do the right psychological job and still break a hard
 * line. true = passes, false = fails, null = not applicable.
 */
export const complianceSchema = z.object({
  /** Randy speaks only in email and video; an SMS in his first person fails. */
  voice_channel: z.boolean().nullable(),
  no_carrier_named: z.boolean().nullable(),
  /** Never predicts a claim, payout, premium change, or how an insurer judges the home. */
  no_outcome_prediction: z.boolean().nullable(),
  no_fake_scarcity: z.boolean().nullable(),
  /** No "save you money", "pays for itself", premium-drop or price-reduction promise. */
  no_savings_promise: z.boolean().nullable(),
  /** "Protection Profile Review", "Documented Defense System", the three in-home visit names. */
  locked_terms: z.boolean().nullable(),
  /** 1972 Winston-Salem NC and 2005 Florida kept apart; 54 years; over two decades. */
  history_facts: z.boolean().nullable(),
  /** Every statistic is one of the five public references. */
  stats_allowed: z.boolean().nullable(),
  /** The CTA goes to the Protection Profile Review, not straight to the in-home visit. */
  cta_review_first: z.boolean().nullable(),
  /** No exclamation marks, ALL CAPS, emoji in email, "Dear valued customer", "We at Reece", "free estimate". */
  voice_guardrails: z.boolean().nullable(),
  crew_wording: z.boolean().nullable(),
  /** A family story is one of P1–P8. */
  parable_in_bank: z.boolean().nullable(),
});
export type Compliance = z.infer<typeof complianceSchema>;

export const COMPLIANCE_LABEL: Record<keyof Compliance, string> = {
  voice_channel: "Randy's voice in a text (he is email and video only)",
  no_carrier_named: "Names an insurance carrier or competitor",
  no_outcome_prediction: "Predicts a claim, payout or premium outcome",
  no_fake_scarcity: "Fake scarcity or countdown",
  no_savings_promise: "Promises savings or a price drop",
  locked_terms: "Wrong name for the Review, the system or the visit",
  history_facts: "Company history stated wrong (1972 NC / 2005 FL / 54 years)",
  stats_allowed: "A statistic outside the five allowed references",
  cta_review_first: "Sends the lead past the Protection Profile Review",
  voice_guardrails: "Voice rule broken (exclamation, caps, emoji in email, banned phrase)",
  crew_wording: "Crew wording off canon",
  parable_in_bank: "Story is not one of the eight parables",
};

/** The compliance keys a message fails, in a fixed order. */
export function complianceFails(c: Compliance | undefined | null): (keyof Compliance)[] {
  if (!c) return [];
  return (Object.keys(COMPLIANCE_LABEL) as (keyof Compliance)[]).filter((k) => c[k] === false);
}

export const messageInsightSchema = z.object({
  stepId: z.string().min(1),
  channel: z.enum(["sms", "email"]),
  /** Send number in its channel, as the Every message tab shows it. */
  n: z.number().int().nullable(),
  stage_intended: buyerStageSchema,
  stage_actual: buyerStageSchema,
  lever: leverSchema,
  /** The psychological job this message should do, one sentence. */
  job: z.string().min(1).max(300),
  /** What it actually does, one sentence. */
  does: z.string().min(1).max(300),
  verdict: verdictSchema,
  /** A line quoted verbatim from the message (or its AI prompt). */
  quote: z.string().max(240),
  issue: z.string().max(400).nullable(),
  recommendation: z.string().max(400).nullable(),
  checks: z.object({
    hso: z.boolean(),
    sms_standalone: z.boolean().nullable(),
    booking_path: z.boolean(),
    local_market: z.boolean(),
    banned_phrases: z.array(z.string()).max(10),
  }),
  /** Optional so older entries still parse; the audit fills it for every message. */
  compliance: complianceSchema.optional(),
});
export type MessageInsight = z.infer<typeof messageInsightSchema>;

export const classificationSchema = z.enum(["messaging", "offer", "traffic", "structure", "healthy"]);
export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  messaging: "Messaging problem — the copy is doing the wrong job",
  offer: "Offer problem — the ask isn't compelling at this stage",
  traffic: "Traffic problem — the wrong people arrive here",
  structure: "Structure problem — the messages aren't going out",
  healthy: "Healthy",
};

export const workflowInsightSchema = z.object({
  ghlWorkflowId: z.string().min(8),
  code: z.string().min(1),
  name: z.string().min(1),
  analysed_version: z.number().int().nullable(),
  analysed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  journey_stage: journeyStageSchema,
  buyer_stage: buyerStageSchema,
  summary: z.object({
    /** What this workflow is trying to do, in one plain sentence. */
    strategy: z.string().min(1).max(300),
    /** The marketing angle / story arc it leans on. */
    angle: z.string().min(1).max(300),
    arcs: z.array(z.string()).max(6),
    /** Where the psychological momentum breaks, or null when it holds. */
    momentum_break: z.string().max(400).nullable(),
    classification: classificationSchema,
    why: z.string().min(1).max(500),
  }),
  messages: z.array(messageInsightSchema),
})
  // Without reply / booking / opt-out data per workflow (migration 0024), an
  // offer or traffic call cannot be more than a suspicion, and the record
  // must say so (Mark, 2026-09-25).
  .refine((w) => !["offer", "traffic"].includes(w.summary.classification) || /^suspected\b/i.test(w.summary.why), {
    message: "an offer or traffic classification must open its `why` with \"Suspected\"",
    path: ["summary", "why"],
  });
export type WorkflowInsight = z.infer<typeof workflowInsightSchema>;

/** True when the classification is a suspicion awaiting outcome data. */
export function isSuspected(w: Pick<WorkflowInsight, "summary">): boolean {
  return w.summary.classification === "offer" || w.summary.classification === "traffic";
}

export const insightsMetaSchema = z.object({
  schema: z.literal(1),
  analysed_at: z.string(),
  method: z.string(),
  workflows: z.number().int(),
  messages: z.number().int(),
});
export type InsightsMeta = z.infer<typeof insightsMetaSchema>;

/** "Analysed at v12 — the workflow is now v14." */
export function isStale(insight: Pick<WorkflowInsight, "analysed_version">, currentVersion: number | null | undefined): boolean {
  return insight.analysed_version !== null && currentVersion !== null && currentVersion !== undefined && currentVersion > insight.analysed_version;
}
