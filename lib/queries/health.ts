import { lpService } from "@/lib/supabase/lp";
import { lpMcp } from "@/lib/mcp/lpClient";
import { hlMcp } from "@/lib/mcp/hlClient";
import { McpError, type McpErrorKind } from "@/lib/mcp/client";
import type {
  HlSyncHealthRaw,
  RailwayServiceStatus,
  RailwayStatusRaw,
  SyncHealth,
  SyncHealthRaw,
} from "@/lib/supabase/types";
import { minutesSince } from "@/lib/utils";

/** Error shape threaded out of a failed MCP call; `kind` drives the UI tile. */
export type McpFailure = { status: "unknown"; error: string; kind: McpErrorKind };

export type HealthSnapshot = {
  lpMcp: RailwayServiceStatus | McpFailure;
  hlMcp: RailwayServiceStatus | McpFailure;
  heartbeat: { lastTickAt: string | null; minutesAgo: number | null };
  lpSync: SyncHealth | McpFailure;
  hlSync: SyncHealth | McpFailure;
};

type Adapted<T> = T | McpFailure;

async function safeAdapt<R, T>(
  p: Promise<R>,
  adapt: (raw: R) => T,
): Promise<Adapted<T>> {
  try {
    return adapt(await p);
  } catch (e) {
    return {
      status: "unknown",
      error: e instanceof Error ? e.message : "unknown",
      kind: e instanceof McpError ? e.kind : "unknown",
    };
  }
}

function adaptSyncHealth(raw: SyncHealthRaw): SyncHealth {
  const entities = Object.values(raw.last_sync_by_entity ?? {});
  const completedTimes = entities
    .map((e) => e?.completed_at)
    .filter((x): x is string => typeof x === "string");
  completedTimes.sort();
  const last_sync_at = completedTimes.at(-1) ?? null;

  let status: SyncHealth["status"] = "unknown";
  if (raw.circuit_breaker?.circuitOpen) {
    status = "error";
  } else if (last_sync_at === null) {
    status = "unknown";
  } else {
    const mins = minutesSince(last_sync_at);
    if (mins === null) status = "unknown";
    else if (mins > 120) status = "stale";
    else status = "healthy";
  }

  return {
    last_sync_at,
    status,
    details: raw as unknown as Record<string, unknown>,
  };
}

/**
 * HL MCP reports sync health as a `sync_state` array (one row per entity).
 * Derive last_sync_at from the most recent row; status mirrors the LP
 * thresholds (>2h since last sync = stale).
 */
function adaptHlSyncHealth(raw: HlSyncHealthRaw): SyncHealth {
  const times = (raw.sync_state ?? [])
    .map((s) => s.last_synced_at)
    .filter((x): x is string => typeof x === "string");
  times.sort();
  const last_sync_at = times.at(-1) ?? null;

  let status: SyncHealth["status"] = "unknown";
  if (last_sync_at !== null) {
    const mins = minutesSince(last_sync_at);
    if (mins === null) status = "unknown";
    else if (mins > 120) status = "stale";
    else status = "healthy";
  }

  return {
    last_sync_at,
    status,
    details: raw as unknown as Record<string, unknown>,
  };
}

function adaptRailwayStatus(
  raw: RailwayStatusRaw,
  fallbackName: string,
): RailwayServiceStatus {
  const node = raw.deployments?.edges?.[0]?.node ?? null;
  let status: RailwayServiceStatus["status"] = "unknown";
  if (node) {
    const s = node.status;
    if (s === "SUCCESS") status = "running";
    else if (s === "BUILDING" || s === "DEPLOYING" || s === "INITIALIZING")
      status = "running";
    else if (s === "FAILED" || s === "CRASHED") status = "error";
    else if (s === "REMOVED") status = "stopped";
  }
  return {
    service: raw.service?.name ?? raw.name ?? fallbackName,
    status,
    last_deploy_at: node?.createdAt ?? null,
    details: raw as unknown as Record<string, unknown>,
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [hlMcpStatus, hlSync, lpSync, heartbeat] = await Promise.all([
    safeAdapt(hlMcp.getRailwayServiceStatus(), (r) => adaptRailwayStatus(r, "hl-mcp")),
    safeAdapt(hlMcp.getSyncHealth(), adaptHlSyncHealth),
    safeAdapt(lpMcp.getSyncHealth(), adaptSyncHealth),
    getHeartbeat(),
  ]);

  // LP MCP doesn't expose Railway status directly — synthesize one from the
  // adapted LP sync health so the tile shows something meaningful.
  const lpMcpStatus: HealthSnapshot["lpMcp"] =
    "error" in lpSync
      ? lpSync
      : {
          service: "lp-mcp",
          status: lpSync.status === "error" ? "error" : "running",
          last_deploy_at: lpSync.last_sync_at,
        };

  return {
    lpMcp: lpMcpStatus,
    hlMcp: hlMcpStatus,
    heartbeat,
    lpSync,
    hlSync,
  };
}

/**
 * The original heartbeat lived in an `agent_events` table that doesn't exist
 * in LP Supabase. Until a dedicated heartbeat table ships, use the most recent
 * `system_events` row as a system-liveness proxy — the agent system writes to
 * it continuously (hundreds of events per day), so absence of writes is a
 * meaningful "engine stalled" signal.
 */
async function getHeartbeat() {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("system_events")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string }>();

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

/**
 * Freshness label for the Supabase Sync tile, derived from the SAME thresholds
 * as `syncStatus()` (the source of the tile's dot color) so the label never
 * contradicts the color — a yellow dot reads "aging", not "healthy".
 */
export function syncFreshnessLabel(snapshot: HealthSnapshot["lpSync"]): string {
  switch (syncStatus(snapshot)) {
    case "healthy":
      return "current";
    case "warning":
      return "aging";
    case "critical":
      return "stale";
    default:
      return "unknown";
  }
}

/**
 * How many monitored services are currently degraded (warning or critical) —
 * the number behind the "{n} service watching" top-bar chip. Built from the
 * same per-component status helpers that drive the Overview health tiles, so
 * the chip never contradicts that page. Returns 0 if the snapshot can't load.
 */
export async function servicesWatchingCount(): Promise<number> {
  try {
    const snap = await getHealthSnapshot();
    const statuses = [
      railwayStatus(snap.lpMcp),
      railwayStatus(snap.hlMcp),
      heartbeatStatus(snap.heartbeat.minutesAgo),
      syncStatus(snap.lpSync),
      syncStatus(snap.hlSync),
    ];
    return statuses.filter((s) => s === "warning" || s === "critical").length;
  } catch {
    return 0;
  }
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
