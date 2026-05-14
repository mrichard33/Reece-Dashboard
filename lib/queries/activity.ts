import { lpService } from "@/lib/supabase/lp";
import type { SystemEvent, ClaudeKnownIssue } from "@/lib/supabase/types";

export async function getRecentActivity(limit = 20): Promise<SystemEvent[]> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("system_events")
      .select("id, event_type, entity_type, entity_id, priority, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as SystemEvent[];
  } catch {
    return [];
  }
}

export async function getActiveAlerts(limit = 10): Promise<ClaudeKnownIssue[]> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("claude_known_issues")
      .select("id, severity, description, owner, opened_at, resolved_at")
      .is("resolved_at", null)
      .order("opened_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as ClaudeKnownIssue[];
  } catch {
    return [];
  }
}
