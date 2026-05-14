import { hlService } from "@/lib/supabase/hl";
import type { Workflow, WorkflowRegistry } from "@/lib/supabase/types";

export type WorkflowRow = {
  id: string;
  ghlWorkflowId: string;
  name: string;
  status: "published" | "draft" | "unknown";
  canonicalCode: string | null;
  stageFamily: string | null;
  lastModified: string | null;
};

export type WorkflowSummary = {
  total: number;
  published: number;
  draft: number;
  withCanonicalCode: number;
  rows: WorkflowRow[];
};

export async function getWorkflowSummary(): Promise<WorkflowSummary> {
  const sb = hlService();

  const [wfRes, regRes] = await Promise.all([
    sb
      .from("workflows")
      .select("id, ghl_workflow_id, name, status, last_modified_at, deleted_at")
      .is("deleted_at", null),
    sb
      .from("workflow_registry")
      .select(
        "canonical_code, workflow_id, workflow_name, stage_family, psychological_stage, trust_state, message_pressure_level",
      ),
  ]);

  const workflows = (wfRes.data ?? []) as Workflow[];
  const registry = (regRes.data ?? []) as WorkflowRegistry[];

  const regByGhlId = new Map<string, WorkflowRegistry>();
  for (const r of registry) {
    if (r.workflow_id) regByGhlId.set(String(r.workflow_id), r);
  }

  const rows: WorkflowRow[] = workflows.map((w) => {
    const reg = regByGhlId.get(w.ghl_workflow_id);
    return {
      id: w.id,
      ghlWorkflowId: w.ghl_workflow_id,
      name: w.name,
      status: (w.status ?? "unknown") as "published" | "draft" | "unknown",
      canonicalCode: reg?.canonical_code ?? null,
      stageFamily: reg?.stage_family ?? null,
      lastModified: w.last_modified_at,
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
