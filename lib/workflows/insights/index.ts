/**
 * The audited strategy insights, loaded once from data.json and validated.
 * A file that fails validation is dropped with a console warning rather than
 * breaking the page — the test suite is where a bad file fails loudly.
 */
import rawData from "./data.json";
import rawMeta from "./meta.json";
import { insightsMetaSchema, workflowInsightSchema, type InsightsMeta, type JourneyStage, type MessageInsight, type Verdict, type WorkflowInsight } from "./schema";

function load(): { byId: Map<string, WorkflowInsight>; meta: InsightsMeta | null } {
  const byId = new Map<string, WorkflowInsight>();
  for (const item of Array.isArray(rawData) ? rawData : []) {
    const r = workflowInsightSchema.safeParse(item);
    if (!r.success) {
      console.warn("[insights] dropped an invalid workflow insight:", r.error.issues[0]?.message);
      continue;
    }
    byId.set(r.data.ghlWorkflowId, r.data);
  }
  const m = insightsMetaSchema.safeParse(rawMeta);
  return { byId, meta: m.success ? m.data : null };
}

const LOADED = load();

export const INSIGHTS: ReadonlyMap<string, WorkflowInsight> = LOADED.byId;
export const INSIGHTS_META: InsightsMeta | null = LOADED.meta;

export function insightFor(ghlWorkflowId: string): WorkflowInsight | null {
  return INSIGHTS.get(ghlWorkflowId) ?? null;
}

export function insightsByStage(): Map<JourneyStage, WorkflowInsight[]> {
  const out = new Map<JourneyStage, WorkflowInsight[]>();
  for (const w of INSIGHTS.values()) out.set(w.journey_stage, [...(out.get(w.journey_stage) ?? []), w]);
  for (const list of out.values()) list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return out;
}

export function verdictCounts(messages: readonly MessageInsight[]): Record<Verdict, number> {
  const out: Record<Verdict, number> = { ok: 0, early_pitch: 0, over_educating: 0, premature_positioning: 0, no_reason_to_act: 0, off_voice: 0, other: 0 };
  for (const m of messages) out[m.verdict]++;
  return out;
}

export { BUYER_STAGE_LABEL, CLASSIFICATION_LABEL, isStale, VERDICT_LABEL } from "./schema";
export type { Classification, InsightsMeta, JourneyStage, Lever, MessageInsight, Verdict, WorkflowInsight } from "./schema";
