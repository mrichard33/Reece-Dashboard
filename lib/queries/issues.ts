import { lpService } from "@/lib/supabase/lp";
import { hlService } from "@/lib/supabase/hl";
import { lpMcp, type DriftCandidate } from "@/lib/mcp/lpClient";
import {
  hlMcp,
  type ContaminationFinding,
  type NamespaceViolation,
} from "@/lib/mcp/hlClient";
import type { ClaudeKnownIssue, Opportunity } from "@/lib/supabase/types";

export type StuckContact = {
  id: string;
  name: string | null;
  pipelineId: string;
  stageId: string;
  daysStuck: number;
  source: string | null;
  monetaryValue: number | null;
  updatedAt: string;
};

export type IssuesPageData = {
  openIssues: ClaudeKnownIssue[];
  contamination: ContaminationFinding[];
  namespaceViolations: NamespaceViolation[];
  driftCandidates: DriftCandidate[];
  stuckContacts: StuckContact[];
  errors: Record<string, string>;
};

async function safe<T>(label: string, p: Promise<T>): Promise<{
  ok: boolean;
  value: T | null;
  err?: string;
}> {
  try {
    const value = await p;
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      value: null,
      err: e instanceof Error ? e.message : `Failed: ${label}`,
    };
  }
}

async function getOpenIssues(): Promise<ClaudeKnownIssue[]> {
  const sb = lpService();
  const { data } = await sb
    .from("claude_known_issues")
    .select("id, severity, description, owner, opened_at, resolved_at")
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("opened_at", { ascending: false });
  return (data ?? []) as ClaudeKnownIssue[];
}

async function getStuckContacts(): Promise<StuckContact[]> {
  const sb = hlService();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  const { data } = await sb
    .from("opportunities")
    .select(
      "id, name, pipeline_id, pipeline_stage_id, monetary_value, source, updated_at",
    )
    .eq("status", "open")
    .lt("updated_at", cutoff.toISOString())
    .order("updated_at", { ascending: true })
    .limit(100);

  const now = Date.now();
  return ((data ?? []) as Array<
    Pick<
      Opportunity,
      | "id"
      | "name"
      | "pipeline_id"
      | "pipeline_stage_id"
      | "monetary_value"
      | "source"
      | "updated_at"
    >
  >).map((o) => ({
    id: o.id,
    name: o.name,
    pipelineId: o.pipeline_id,
    stageId: o.pipeline_stage_id,
    monetaryValue: o.monetary_value,
    source: o.source,
    updatedAt: o.updated_at,
    daysStuck: Math.floor((now - new Date(o.updated_at).getTime()) / 86400000),
  }));
}

export async function getIssuesPageData(): Promise<IssuesPageData> {
  const [issues, contamination, namespace, drift, stuck] = await Promise.all([
    safe("openIssues", getOpenIssues()),
    safe("contamination", hlMcp.checkContamination()),
    safe("namespace", hlMcp.auditNamespaceViolations()),
    safe("drift", lpMcp.getDriftCandidates()),
    safe("stuck", getStuckContacts()),
  ]);

  const errors: Record<string, string> = {};
  if (!issues.ok) errors.openIssues = issues.err!;
  if (!contamination.ok) errors.contamination = contamination.err!;
  if (!namespace.ok) errors.namespace = namespace.err!;
  if (!drift.ok) errors.drift = drift.err!;
  if (!stuck.ok) errors.stuck = stuck.err!;

  return {
    openIssues: issues.value ?? [],
    contamination: contamination.value?.rows ?? [],
    namespaceViolations: namespace.value?.rows ?? [],
    driftCandidates: drift.value?.rows ?? [],
    stuckContacts: stuck.value ?? [],
    errors,
  };
}
