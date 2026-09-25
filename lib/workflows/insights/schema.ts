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
});
export type WorkflowInsight = z.infer<typeof workflowInsightSchema>;

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
