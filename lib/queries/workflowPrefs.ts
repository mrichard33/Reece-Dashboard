/**
 * Per-user Workflows-page preferences (LP Supabase, db/migrations/0022):
 * starred workflows and saved filter presets. Read side; writes are in
 * lib/actions/workflowPrefs.ts. Email is lowercased on both sides.
 */
import { getSessionUser } from "@/lib/auth";
import { lpService } from "@/lib/supabase/lp";
import { parseFilterState, type WorkflowFilterState } from "@/lib/workflows/filters";

export type WorkflowPreset = { id: number; name: string; filters: WorkflowFilterState };
export type WorkflowPrefs = { favorites: string[]; presets: WorkflowPreset[] };

export async function loadWorkflowPrefs(): Promise<WorkflowPrefs> {
  const user = await getSessionUser();
  if (!user) return { favorites: [], presets: [] };
  const email = user.email.toLowerCase();
  const sb = lpService();
  const [favRes, presetRes] = await Promise.all([
    sb.from("dashboard_workflow_favorites").select("ghl_workflow_id").eq("email", email),
    sb.from("dashboard_workflow_presets").select("id, name, filters").eq("email", email).order("name"),
  ]);
  if (favRes.error) console.warn("[workflowPrefs] favorites:", favRes.error.message);
  if (presetRes.error) console.warn("[workflowPrefs] presets:", presetRes.error.message);
  const presets: WorkflowPreset[] = [];
  for (const p of (presetRes.data ?? []) as { id: number; name: string; filters: unknown }[]) {
    const filters = parseFilterState(p.filters);
    // An older preset shape is skipped, never a crash — the user can re-save it.
    if (!filters) {
      console.warn(`[workflowPrefs] preset ${p.id} "${p.name}" has an unreadable filter shape — skipped`);
      continue;
    }
    presets.push({ id: p.id, name: p.name, filters });
  }
  return {
    favorites: ((favRes.data ?? []) as { ghl_workflow_id: string }[]).map((f) => f.ghl_workflow_id),
    presets,
  };
}
