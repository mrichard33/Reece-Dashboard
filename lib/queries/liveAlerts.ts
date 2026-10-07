import { lpService } from "@/lib/supabase/lp";
import type { LiveAlert } from "@/lib/supabase/types";

// Matches the sync tile's "stale" boundary in lib/queries/health.ts. Worked
// out here, not in the component: render must not read the clock.
const STALE_MS = 2 * 60 * 60 * 1000;

/**
 * Live operational alerts — LP-MCP `alert_conditions` where state = 'firing'.
 * This is the edge-triggered state every watchdog writes (src/alert-state.js),
 * so a row here IS a condition the system currently believes is bad, and
 * last_seen_at is the last sweep that still saw it. Grouped by label because
 * set-valued conditions write one key per entity (drift writes one per
 * contact — 156 keys for one condition on 2026-10-07).
 */
export async function getLiveAlerts(): Promise<LiveAlert[]> {
  try {
    const sb = lpService();
    const { data, error } = await sb
      .from("alert_conditions")
      .select("alert_key,label,first_seen_at,last_seen_at,detail")
      .eq("state", "firing")
      .order("last_seen_at", { ascending: false })
      .limit(2000);
    if (error) return [];

    const byLabel = new Map<string, LiveAlert>();
    for (const r of (data ?? []) as { alert_key: string; label: string | null; first_seen_at: string; last_seen_at: string; detail: string | null }[]) {
      const label = r.label ?? r.alert_key;
      const cur = byLabel.get(label);
      if (!cur) {
        byLabel.set(label, { label, keys: 1, first_seen_at: r.first_seen_at, last_seen_at: r.last_seen_at, detail: r.detail, stale: false });
      } else {
        cur.keys += 1;
        if (r.first_seen_at < cur.first_seen_at) cur.first_seen_at = r.first_seen_at;
        if (r.last_seen_at > cur.last_seen_at) { cur.last_seen_at = r.last_seen_at; cur.detail = r.detail; }
      }
    }
    const now = Date.now();
    for (const a of byLabel.values()) a.stale = now - new Date(a.last_seen_at).getTime() > STALE_MS;
    return [...byLabel.values()].sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));
  } catch {
    return [];
  }
}
