import { lpService } from "@/lib/supabase/lp";
import { lpMcp } from "@/lib/mcp/lpClient";
import { hlMcp } from "@/lib/mcp/hlClient";
import type {
  RailwayServiceStatus,
  SyncHealth,
  AgentEvent,
} from "@/lib/supabase/types";
import { minutesSince } from "@/lib/utils";

export type HealthSnapshot = {
  lpMcp: RailwayServiceStatus | { status: "unknown"; error: string };
  hlMcp: RailwayServiceStatus | { status: "unknown"; error: string };
  heartbeat: { lastTickAt: string | null; minutesAgo: number | null };
  lpSync: SyncHealth | { status: "unknown"; error: string };
  hlSync: SyncHealth | { status: "unknown"; error: string };
};

async function safe<T>(p: Promise<T>): Promise<T | { status: "unknown"; error: string }> {
  try {
    return await p;
  } catch (e) {
    return { status: "unknown", error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [hlStatus, hlSync, lpSync, heartbeat] = await Promise.all([
    safe(hlMcp.getRailwayServiceStatus()),
    safe(hlMcp.getSyncHealth()),
    safe(lpMcp.getSyncHealth()),
    getHeartbeat(),
  ]);

  // LP MCP doesn't expose railway status directly via MCP — infer from sync health.
  const lpMcpStatus: HealthSnapshot["lpMcp"] =
    "error" in lpSync
      ? lpSync
      : {
          service: "lp-mcp",
          status: lpSync.status === "error" ? "error" : "running",
          last_deploy_at: null,
        };

  return {
    lpMcp: lpMcpStatus,
    hlMcp: hlStatus,
    heartbeat,
    lpSync,
    hlSync,
  };
}

async function getHeartbeat() {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("agent_events")
      .select("created_at")
      .eq("event_type", "heartbeat.tick")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Pick<AgentEvent, "created_at">>();

    const lastTickAt = data?.created_at ?? null;
    return { lastTickAt, minutesAgo: minutesSince(lastTickAt) };
  } catch {
    return { lastTickAt: null, minutesAgo: null };
  }
}

export function heartbeatStatus(minutesAgo: number | null) {
  if (minutesAgo === null) return "neutral" as const;
  if (minutesAgo <= 6) return "healthy" as const;
  if (minutesAgo <= 15) return "warning" as const;
  return "critical" as const;
}

export function syncStatus(snapshot: HealthSnapshot["lpSync"]) {
  if ("error" in snapshot) return "neutral" as const;
  if (!snapshot.last_sync_at) return "neutral" as const;
  const mins = minutesSince(snapshot.last_sync_at);
  if (mins === null) return "neutral" as const;
  if (mins <= 30) return "healthy" as const;
  if (mins <= 120) return "warning" as const;
  return "critical" as const;
}

export function railwayStatus(s: HealthSnapshot["lpMcp"]) {
  if ("error" in s) return "neutral" as const;
  if (s.status === "running") {
    if (!s.last_deploy_at) return "healthy" as const;
    const days = (minutesSince(s.last_deploy_at) ?? 0) / 60 / 24;
    if (days <= 7) return "healthy" as const;
    return "warning" as const;
  }
  if (s.status === "stopped" || s.status === "error") return "critical" as const;
  return "neutral" as const;
}
