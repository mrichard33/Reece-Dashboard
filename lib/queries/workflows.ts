import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import type { Workflow, WorkflowRegistry } from "@/lib/supabase/types";
import { codesFor } from "@/lib/journey/tags";
import { activeTagsFor, pgArray, STOPPED_TAGS } from "@/lib/queries/workflowDetail";

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
};

export type WorkflowSummary = {
  total: number;
  published: number;
  draft: number;
  withCanonicalCode: number;
  rows: WorkflowRow[];
};

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
    sb.from("workflows").select("id, ghl_workflow_id, name, status, updated_at, deleted_at").is("deleted_at", null),
    sb.from("workflow_registry").select("canonical_code, workflow_id, canonical_name, legacy_name, stage_family"),
  ]);
  if (wfRes.error) throw new Error(`HL workflows: ${wfRes.error.message}`);
  if (regRes.error) throw new Error(`HL workflow_registry: ${regRes.error.message}`);

  const workflows = (wfRes.data ?? []) as Workflow[];
  const registry = (regRes.data ?? []) as (WorkflowRegistry & { stage_family: string | null })[];

  const regByGhlId = new Map<string, WorkflowRegistry & { stage_family: string | null }>();
  for (const r of registry) {
    if (r.workflow_id) regByGhlId.set(String(r.workflow_id), r);
  }

  const counts = await getActiveLeadCounts().catch((): Record<string, number | null> => ({}));

  const rows: WorkflowRow[] = workflows.map((w) => {
    const reg = regByGhlId.get(w.ghl_workflow_id);
    return {
      id: w.id,
      ghlWorkflowId: w.ghl_workflow_id,
      name: w.name,
      status: (w.status ?? "unknown") as "published" | "draft" | "unknown",
      canonicalCode: reg?.canonical_code ?? null,
      stageFamily: reg?.stage_family ?? null,
      lastModified: w.updated_at,
      activeLeads: reg ? (counts[w.ghl_workflow_id] ?? null) : null,
    };
  });

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
  };
}
