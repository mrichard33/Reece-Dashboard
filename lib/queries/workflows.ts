import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import type { Workflow, WorkflowRegistry } from "@/lib/supabase/types";
import { codesFor } from "@/lib/journey/tags";
import { activeTagsFor, pgArray, STOPPED_TAGS } from "@/lib/queries/workflowDetail";
import { routeFor, type RouteKey } from "@/lib/workflows/routes";
import { chainOrder, type ChainPosition } from "@/lib/workflows/chain";
import { matchStepSends, summarizeWorkflow, type WorkflowSending } from "@/lib/workflows/sendActivity";
import { loadSendActivityRaw } from "@/lib/workflows/sendActivity.server";

export type WorkflowRow = {
  id: string;
  ghlWorkflowId: string;
  name: string;
  status: "published" | "draft" | "unknown";
  canonicalCode: string | null;
  stageFamily: string | null;
  lastModified: string | null;
  /** Contacts carrying this workflow's `active-<code>` tag; null = unknown. */
  activeLeads: number | null;
  version: number | null;
  /** Funnel route (lib/workflows/routes.ts). */
  route: RouteKey;
  /** Position in its route's hand-off chain; null when the registry links nothing. */
  chain: ChainPosition | null;
  routesTo: string[];
  receivesFrom: string[];
  /** SMS + email steps in the cached graph. */
  messageSteps: number;
  /** Real activity in the last 30 days (lib/workflows/sendActivity.ts); null = snapshot unavailable. */
  sending: WorkflowSending | null;
};

export type WorkflowSummary = {
  total: number;
  published: number;
  draft: number;
  withCanonicalCode: number;
  rows: WorkflowRow[];
  /** When the send snapshot was taken, or why there is none. */
  sendActivity: { computedAt: string; days: number } | { error: string };
};

/** SMS/email step ids per workflow — one small read, cached with the graphs. */
const getMessageSteps = unstable_cache(
  async () => {
    const sb = hlService();
    const { data, error } = await sb.from("workflow_steps").select("workflow_id, step_id").in("step_type", ["sms", "email"]);
    if (error) throw new Error(`HL workflow_steps: ${error.message}`);
    const out: Record<string, string[]> = {};
    for (const r of (data ?? []) as { workflow_id: string; step_id: string }[]) (out[r.workflow_id] ??= []).push(r.step_id);
    return out;
  },
  ["workflows", "message-steps"],
  { revalidate: 600, tags: ["journey-static"] },
);

/**
 * Active-lead count per registered workflow, keyed by ghl_workflow_id.
 *
 * One head-only count per workflow on the contacts.tags GIN index. The REST
 * layer has no unnest/GROUP BY, and pulling 26K tag arrays to count in JS
 * would move ~10MB per page view. Cached 5 minutes; a failed count is null
 * ("could not tell"), never 0.
 */
const getActiveLeadCounts = unstable_cache(
  async () => {
    const sb = hlService();
    const { data, error: regError } = await sb.from("workflow_registry").select("workflow_id, canonical_code, legacy_name");
    if (regError) throw new Error(`HL workflow_registry: ${regError.message}`);
    const registry = (data ?? []) as { workflow_id: string; canonical_code: string | null; legacy_name: string | null }[];
    const out: Record<string, number | null> = {};
    const queue = registry.filter((r) => r.workflow_id && r.canonical_code);
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const tags = activeTagsFor(
          codesFor({ canonical_code: r.canonical_code, canonical_name: null, legacy_name: r.legacy_name, workflow_id: r.workflow_id }),
        );
        const { count, error } = await sb
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .is("deleted_at", null)
          .overlaps("tags", pgArray(tags))
      .not("tags", "ov", pgArray(STOPPED_TAGS));
        out[r.workflow_id] = error ? null : (count ?? 0);
      }
    };
    await Promise.all(Array.from({ length: 24 }, worker));
    return out;
  },
  ["workflows", "active-lead-counts"],
  { revalidate: 300, tags: ["journey-static"] },
);

export async function getWorkflowSummary(): Promise<WorkflowSummary> {
  const sb = hlService();

  // Column names checked against HL on 2026-09-24. This query used to select
  // workflows.last_modified_at and workflow_registry.workflow_name, neither of
  // which exists; PostgREST rejected both reads and, with the error ignored,
  // the page rendered an empty inventory. Errors now throw so that cannot
  // happen quietly again.
  const [wfRes, regRes] = await Promise.all([
    sb.from("workflows").select("id, ghl_workflow_id, name, status, version, updated_at, deleted_at").is("deleted_at", null),
    sb.from("workflow_registry").select("canonical_code, workflow_id, canonical_name, legacy_name, stage_family, routes_to, receives_from"),
  ]);
  if (wfRes.error) throw new Error(`HL workflows: ${wfRes.error.message}`);
  if (regRes.error) throw new Error(`HL workflow_registry: ${regRes.error.message}`);

  type Reg = WorkflowRegistry & { stage_family: string | null; routes_to: string[] | null; receives_from: string[] | null };
  const workflows = (wfRes.data ?? []) as (Workflow & { version: number | null })[];
  const registry = (regRes.data ?? []) as Reg[];

  const regByGhlId = new Map<string, Reg>();
  for (const r of registry) {
    if (r.workflow_id) regByGhlId.set(String(r.workflow_id), r);
  }

  const [counts, steps, raw] = await Promise.all([
    getActiveLeadCounts().catch((): Record<string, number | null> => ({})),
    getMessageSteps().catch((): Record<string, string[]> => ({})),
    loadSendActivityRaw(),
  ]);
  // Content matches once for every step, then each workflow sums its own.
  const contentByStep = raw.ok ? matchStepSends(raw.stepHeads, raw.heads) : new Map();

  const base = workflows.map((w) => {
    const reg = regByGhlId.get(w.ghl_workflow_id);
    const status = (w.status ?? "unknown") as "published" | "draft" | "unknown";
    const codes = reg ? codesFor({ canonical_code: reg.canonical_code, canonical_name: reg.canonical_name, legacy_name: reg.legacy_name, workflow_id: reg.workflow_id }) : [];
    const stepIds = steps[w.ghl_workflow_id] ?? [];
    const route = routeFor({ stageFamily: reg?.stage_family ?? null, canonicalCode: reg?.canonical_code ?? null, name: w.name });
    return {
      id: w.id,
      ghlWorkflowId: w.ghl_workflow_id,
      name: w.name,
      status,
      canonicalCode: reg?.canonical_code ?? null,
      stageFamily: reg?.stage_family ?? null,
      lastModified: w.updated_at,
      activeLeads: reg ? (counts[w.ghl_workflow_id] ?? null) : null,
      version: w.version ?? null,
      route,
      routesTo: (reg?.routes_to ?? []).map(String),
      receivesFrom: (reg?.receives_from ?? []).map(String),
      messageSteps: stepIds.length,
      sending: summarizeWorkflow({ status, messageSteps: stepIds.length, codes, stepIds, raw, contentByStep }),
    };
  });
  const chain = chainOrder(base.map((r) => ({ ghlWorkflowId: r.ghlWorkflowId, code: r.canonicalCode, route: r.route, routesTo: r.routesTo, receivesFrom: r.receivesFrom })));
  const rows: WorkflowRow[] = base.map((r) => ({ ...r, chain: chain.get(r.ghlWorkflowId) ?? null }));

  rows.sort((a, b) => {
    const aCode = a.canonicalCode ?? "ZZ";
    const bCode = b.canonicalCode ?? "ZZ";
    return aCode.localeCompare(bCode);
  });

  return {
    total: rows.length,
    published: rows.filter((r) => r.status === "published").length,
    draft: rows.filter((r) => r.status === "draft").length,
    withCanonicalCode: rows.filter((r) => r.canonicalCode !== null).length,
    rows,
    sendActivity: raw.ok ? { computedAt: raw.computedAt, days: raw.days } : { error: raw.reason },
  };
}
