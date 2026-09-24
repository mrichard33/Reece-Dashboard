/**
 * Loads one workflow's step graph from the HL cache — steps, connections and
 * the templates its sms/email steps reference. Cached 10 minutes and shared:
 * every contact in a workflow projects from the same graph.
 */
import { unstable_cache } from "next/cache";
import { hlService } from "@/lib/supabase/hl";
import { toGraphStep, type WorkflowGraph, type WorkflowStepRow } from "./workflowGraph";

async function load(ghlWorkflowId: string): Promise<WorkflowGraph> {
  const sb = hlService();
  const [stepsRes, connRes] = await Promise.all([
    sb
      .from("workflow_steps")
      .select("step_id, step_order, step_type, template_id, branch_condition, raw_json")
      .eq("workflow_id", ghlWorkflowId)
      .order("step_order", { ascending: true })
      .limit(2000),
    sb
      .from("workflow_connections")
      .select("from_step, to_step, condition")
      .eq("workflow_id", ghlWorkflowId)
      .limit(4000),
  ]);
  if (stepsRes.error) throw new Error(`HL workflow_steps: ${stepsRes.error.message}`);
  if (connRes.error) throw new Error(`HL workflow_connections: ${connRes.error.message}`);

  const steps = ((stepsRes.data ?? []) as WorkflowStepRow[]).map(toGraphStep);
  const templateIds = [
    ...new Set(
      steps
        .filter((s) => s.type === "sms" || s.type === "email")
        .map((s) => s.templateId ?? (typeof s.data.templateId === "string" ? s.data.templateId : null))
        .filter((x): x is string => !!x),
    ),
  ];
  const templates: WorkflowGraph["templates"] = {};
  if (templateIds.length) {
    const { data, error } = await sb
      .from("templates")
      .select("ghl_template_id, name, subject, body")
      .in("ghl_template_id", templateIds)
      .is("deleted_at", null);
    if (!error) {
      for (const t of (data ?? []) as { ghl_template_id: string; name: string | null; subject: string | null; body: string | null }[]) {
        templates[t.ghl_template_id] = { name: t.name, subject: t.subject, body: t.body };
      }
    }
  }

  return {
    workflowId: ghlWorkflowId,
    steps,
    connections: ((connRes.data ?? []) as { from_step: string; to_step: string; condition: string | null }[]).map((c) => ({
      from: c.from_step,
      to: c.to_step,
      condition: c.condition,
    })),
    templates,
  };
}

export function loadWorkflowGraph(ghlWorkflowId: string): Promise<WorkflowGraph> {
  return unstable_cache(() => load(ghlWorkflowId), ["workflow-graph", ghlWorkflowId], {
    revalidate: 600,
    tags: ["journey-static", `workflow-graph:${ghlWorkflowId}`],
  })();
}
