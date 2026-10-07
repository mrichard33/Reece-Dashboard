/**
 * Plain words for the forks in a GHL workflow, shared by the flowchart
 * (flowLayout.ts) and the "Every message" routes (workflowGraph.ts) so the two
 * tabs never name the same fork differently.
 *
 * 2026-10-07: GHL's A/B split ("workflow_split") stores its name as an
 * untranslated UI key, "workflow.asideSection.headerMeta.workflowSplit", and
 * the F.0 flowchart printed exactly that. Any `workflow.…` key is replaced.
 */
import type { GraphStep } from "./workflowGraph";

type Cond = { conditionSubType?: unknown; conditionOperator?: unknown; conditionValue?: unknown; conditionType?: unknown };

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function describeCondition(c: Cond): string {
  const sub = String(c.conditionSubType ?? "");
  const op = String(c.conditionOperator ?? "");
  const vals = (Array.isArray(c.conditionValue) ? c.conditionValue : [c.conditionValue]).filter((v) => v !== undefined && v !== null && v !== "").map(String);
  const list = vals.join(" or ");
  if (sub === "tags") return op === "index-of-false" ? `does not have tag ${list}` : `has tag ${list}`;
  if (sub === "trigger") return "came in through this workflow's trigger";
  // A 20-character GHL field id means nothing to a reader (F.0 printed
  // "has REOrSe5b4Spk7w94z155", 2026-10-07).
  const customId = /^[A-Za-z0-9]{20}$/.test(sub);
  const field = customId ? "a custom field" : sub.replace(/_/g, " ");
  if (op === "has_value") return customId ? "a custom field is filled in" : `has ${field || "a value"}`;
  if (op === "has_no_value") return customId ? "a custom field is empty" : `has no ${field || "value"}`;
  if (sub === "day_week") return `day of week ${op} ${list}`;
  if (sub === "quarter_hour") return `time ${op} ${list}`;
  return `${field || "a field"} ${op} ${list}`.trim();
}

/** A branch definition (condition node's data.branches[i]) in plain words. */
export function describeBranch(def: Record<string, unknown> | undefined): string {
  if (!def) return "";
  const segs = Array.isArray(def.segments) ? (def.segments as Record<string, unknown>[]) : [];
  const parts = segs.map((sg) => {
    const conds = Array.isArray(sg.conditions) ? (sg.conditions as Cond[]) : [];
    const or = String(sg.operator ?? "and") === "or";
    // F.0's objection check is eight "has tag …" ORed together; one list reads better.
    if (or && conds.length > 2 && conds.every((c) => c.conditionSubType === "tags" && c.conditionOperator === "index-of-true")) {
      const tags = conds.flatMap((c) => (Array.isArray(c.conditionValue) ? c.conditionValue : [c.conditionValue]).map(String));
      return `has any of these tags: ${tags.join(", ")}`;
    }
    return conds.map(describeCondition).join(or ? " or " : " and ");
  });
  return parts.filter(Boolean).join(String(def.operator ?? "and") === "or" ? " — or — " : " — and — ");
}

/** True for a name GHL left as an untranslated UI key ("workflow.asideSection…"). */
export function isUiKey(name: string): boolean {
  return /^workflow\.[A-Za-z.]+$/.test(name.trim());
}

/** A step's name fit to show: GHL UI keys are replaced by what the step is. */
export function stepDisplayName(step: Pick<GraphStep, "name" | "type" | "data">): string {
  if (step.name && !isUiKey(step.name)) return step.name;
  if (step.type === "workflow_split") return "A/B test (random split)";
  const own = typeof step.data.name === "string" && !isUiKey(step.data.name) ? step.data.name : "";
  return own || step.type.replace(/_/g, " ");
}

/** "Path A · 50%" for one side of an A/B split; null when `step` is not a split. */
export function splitPathLabel(step: Pick<GraphStep, "type" | "data">, kidId: string, kidName: string | undefined): string | null {
  if (step.type !== "workflow_split") return null;
  const paths = Array.isArray(step.data.paths) ? (step.data.paths as Record<string, unknown>[]) : [];
  const name = kidName || String(paths.find((p) => p.id === kidId)?.name ?? "a path");
  const weight = obj(obj(step.data.extras).weightDistribution)[kidId];
  return typeof weight === "number" ? `${name} · ${weight}% of leads` : name;
}
