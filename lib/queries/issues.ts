import { lpServer, lpService } from "@/lib/supabase/lp";
import { hlService } from "@/lib/supabase/hl";
import { lpMcp, type DriftCandidate } from "@/lib/mcp/lpClient";
import {
  hlMcp,
  type ContaminationFinding,
  type NamespaceViolation,
} from "@/lib/mcp/hlClient";
import { McpError, type McpErrorKind } from "@/lib/mcp/client";
import type { ClaudeKnownIssue, Opportunity } from "@/lib/supabase/types";

export type StuckContact = {
  id: string;
  name: string | null;
  pipelineId: string;
  stageId: string;
  /** Friendly stage name resolved from pipelines.stages; null when unmapped. */
  stageName: string | null;
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
  /** Per-section MCP failure kind (auth/unreachable/…), keyed like `errors`. */
  errorKinds: Record<string, McpErrorKind>;
};

async function safe<T>(label: string, p: Promise<T>): Promise<{
  ok: boolean;
  value: T | null;
  err?: string;
  kind?: McpErrorKind;
}> {
  try {
    const value = await p;
    return { ok: true, value };
  } catch (e) {
    return {
      ok: false,
      value: null,
      err: e instanceof Error ? e.message : `Failed: ${label}`,
      kind: e instanceof McpError ? e.kind : undefined,
    };
  }
}

async function getOpenIssues(): Promise<ClaudeKnownIssue[]> {
  const sb = lpService();
  const { data } = await sb
    .from("claude_known_issues")
    .select(
      "id, severity, category, description, status, reported_date, resolved_date, workflow_id, workflow_name, impact",
    )
    .eq("status", "open")
    .order("severity", { ascending: false })
    .order("reported_date", { ascending: false });
  return (data ?? []) as ClaudeKnownIssue[];
}

async function getStuckContacts(): Promise<StuckContact[]> {
  const sb = hlService();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);

  // Age by date_updated (GHL-native last change), NOT the cache-side updated_at
  // (defaults to now() on every sync, so it never registers as stuck).
  const { data } = await sb
    .from("opportunities")
    .select(
      "id, name, ghl_pipeline_id, ghl_stage_id, monetary_value, source, date_updated",
    )
    .eq("status", "open")
    .is("deleted_at", null)
    .lt("date_updated", cutoff.toISOString())
    .order("date_updated", { ascending: true })
    .limit(100);

  // Resolve a friendly stage name from pipelines.stages (ghl_stage_id → name).
  // Best-effort: if this read fails we degrade to the raw stage id rather than
  // blanking the whole table.
  const stageNames = new Map<string, string>();
  try {
    const { data: pipes } = await sb
      .from("pipelines")
      .select("stages")
      .is("deleted_at", null);
    for (const p of (pipes ?? []) as Array<{
      stages: Array<{ id: string; name: string }> | null;
    }>) {
      for (const s of p.stages ?? []) {
        if (s?.id) stageNames.set(s.id, s.name);
      }
    }
  } catch {
    /* leave stageNames empty — rows fall back to the raw stage id */
  }

  const now = Date.now();
  return ((data ?? []) as Array<
    Pick<
      Opportunity,
      | "id"
      | "name"
      | "ghl_pipeline_id"
      | "ghl_stage_id"
      | "monetary_value"
      | "source"
      | "date_updated"
    >
  >)
    .filter((o) => o.date_updated !== null)
    .map((o) => ({
      id: o.id,
      name: o.name,
      pipelineId: o.ghl_pipeline_id,
      stageId: o.ghl_stage_id ?? "",
      stageName: stageNames.get(o.ghl_stage_id ?? "") ?? null,
      monetaryValue: o.monetary_value,
      source: o.source,
      updatedAt: o.date_updated!,
      daysStuck: Math.floor(
        (now - new Date(o.date_updated!).getTime()) / 86400000,
      ),
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
  const errorKinds: Record<string, McpErrorKind> = {};
  for (const [key, r] of [
    ["openIssues", issues],
    ["contamination", contamination],
    ["namespace", namespace],
    ["drift", drift],
    ["stuck", stuck],
  ] as const) {
    if (!r.ok) {
      errors[key] = r.err!;
      if (r.kind) errorKinds[key] = r.kind;
    }
  }

  return {
    openIssues: issues.value ?? [],
    contamination: contamination.value?.rows ?? [],
    namespaceViolations: namespace.value?.rows ?? [],
    driftCandidates: drift.value?.rows ?? [],
    stuckContacts: stuck.value ?? [],
    errors,
    errorKinds,
  };
}

/**
 * Open-issue counts split into total and "urgent" (high/critical severity) for
 * the top-bar attention chip ("{open} open issues · {urgent} urgent"). Degrades
 * to zeros on error.
 */
export async function openIssuesSummary(): Promise<{
  open: number;
  urgent: number;
}> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("claude_known_issues")
      .select("severity")
      .eq("status", "open");
    if (error || !data) return { open: 0, urgent: 0 };
    const urgent = data.filter(
      (r) => r.severity === "high" || r.severity === "critical",
    ).length;
    return { open: data.length, urgent };
  } catch {
    return { open: 0, urgent: 0 };
  }
}
