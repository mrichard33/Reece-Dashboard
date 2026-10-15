import { lpService } from "@/lib/supabase/lp";
import { isMissingRelation } from "@/lib/queries/pgErrors";
import { shapeSystemStrip, type SystemChip, type SystemStatusRaw } from "@/lib/queries/systemStatus.core";

/**
 * The eight system chips on /overview (LP-MCP System Health, 2026-10-15).
 * Reads both views; the core decides live-over-shadow. A missing view (the
 * migration not applied) or a failed read returns state "missing"/"error"
 * so the strip says so instead of drawing eight greys that look like
 * "nothing configured".
 */
export type StripResult =
  | { state: "ok"; chips: SystemChip[] }
  | { state: "missing" }
  | { state: "error"; message: string };

export async function getSystemStrip(): Promise<StripResult> {
  try {
    const sb = lpService();
    const cols = "system,color,red,yellow,green,last_observed_at";
    const [live, shadow] = await Promise.all([
      sb.from("v_system_status").select(cols),
      sb.from("v_system_status_shadow").select(cols),
    ]);
    if (isMissingRelation(live.error) || isMissingRelation(shadow.error)) return { state: "missing" };
    if (live.error || shadow.error) return { state: "error", message: (live.error ?? shadow.error)?.message ?? "read failed" };
    return {
      state: "ok",
      chips: shapeSystemStrip((live.data ?? []) as SystemStatusRaw[], (shadow.data ?? []) as SystemStatusRaw[]),
    };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
