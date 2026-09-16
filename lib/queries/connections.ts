import { lpMcp } from "@/lib/mcp/lpClient";
import { hlMcp } from "@/lib/mcp/hlClient";
import { lpService } from "@/lib/supabase/lp";
import { hlService } from "@/lib/supabase/hl";
import { minutesSince } from "@/lib/utils";
import type { HlSyncHealthRaw, RailwayStatusRaw } from "@/lib/supabase/types";
import { runAll, type ProbeResult, type ProbeSpec } from "@/lib/connections/probe";
import { isConnectorState, type ConnectorGroup, type ConnectorStatus } from "@/lib/connections/types";

/**
 * Settings → Integrations: one honest row per external service.
 *
 * Two sources, merged:
 *   1. Probes the dashboard can run with credentials it already holds: both
 *      MCPs, both Supabase instances, GHL (via HL MCP), n8n, Railway.
 *   2. LP MCP `GET /health/integrations`, which probes the services whose
 *      credentials live only in that process: the LP API, Five9, Slack,
 *      GroupMe. If that endpoint is unreachable or not yet deployed, its four
 *      rows come back `unknown` with the reason. They are never dropped, and
 *      never green by default.
 *
 * Uncached on purpose: this is an admin-only page a person opens to ask "right
 * now?", and every probe is capped (5s each, 8s for the LP MCP fan-out) so the
 * worst case is bounded.
 */

const LP_ROWS: { id: string; name: string; group: ConnectorGroup }[] = [
  { id: "lp_api", name: "Lead Perfection API", group: "services" },
  { id: "five9", name: "Five9", group: "dialer" },
  { id: "slack", name: "Slack mirror", group: "notify" },
  { id: "groupme", name: "GroupMe", group: "notify" },
];

const LP_FANOUT_TIMEOUT_MS = 8_000;

function trimBase(v: string | undefined): string {
  return (v ?? "").trim().replace(/\/+$/, "");
}

/** LP MCP's four probes, or four `unknown` rows carrying the reason. */
export async function lpIntegrationRows(deps: {
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<ConnectorStatus[]> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetch ?? fetch;
  const base = trimBase(env.LP_MCP_URL);
  const checkedAt = new Date().toISOString();
  const unknownAll = (reason: string): ConnectorStatus[] =>
    LP_ROWS.map((r) => ({
      ...r,
      state: "unknown",
      detail: `LP MCP /health/integrations unavailable: ${reason}`,
      checkedAt,
    }));

  if (!base) return unknownAll("LP_MCP_URL is not set on the dashboard.");

  const headers: Record<string, string> = {};
  const token = (env.LP_MCP_AUTH_TOKEN ?? "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await doFetch(`${base}/health/integrations`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(LP_FANOUT_TIMEOUT_MS),
    });
    if (res.status === 404) return unknownAll("endpoint not deployed yet (HTTP 404).");
    if (res.status === 401) return unknownAll("LP_MCP_AUTH_TOKEN rejected (HTTP 401).");
    if (!res.ok) return unknownAll(`HTTP ${res.status}.`);
    const body = (await res.json()) as {
      integrations?: {
        id: string;
        name?: string;
        group?: string;
        state?: string;
        detail?: string;
        checked_at?: string;
        latency_ms?: number;
        meta?: ConnectorStatus["meta"];
      }[];
    };
    const byId = new Map((body.integrations ?? []).map((r) => [r.id, r]));
    return LP_ROWS.map((known) => {
      const r = byId.get(known.id);
      if (!r) return { ...known, state: "unknown", detail: "Row missing from LP MCP response.", checkedAt };
      return {
        ...known,
        state: isConnectorState(r.state) ? r.state : "unknown",
        detail: r.detail ?? "",
        checkedAt: r.checked_at ?? checkedAt,
        ...(typeof r.latency_ms === "number" ? { latencyMs: r.latency_ms } : {}),
        ...(r.meta ? { meta: r.meta } : {}),
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = /timeout|abort/i.test(msg);
    return unknownAll(timedOut ? `no answer within ${LP_FANOUT_TIMEOUT_MS / 1000}s.` : msg);
  }
}

// ─── Dashboard-side probes ──────────────────────────────────────────

function mcpPingProbe(id: "lp_mcp" | "hl_mcp"): ProbeSpec {
  const isLp = id === "lp_mcp";
  return {
    id,
    name: isLp ? "LP MCP" : "HL MCP",
    group: "services",
    async fn(): Promise<ProbeResult> {
      const url = trimBase(isLp ? process.env.LP_MCP_URL : process.env.HL_MCP_URL);
      if (!url) {
        return {
          state: "not_configured",
          detail: `Set ${isLp ? "LP_MCP_URL" : "HL_MCP_URL"} on the dashboard.`,
        };
      }
      // ping() throws an McpError with an actionable message on auth /
      // unreachable / timeout; probe() turns that into an `error` row.
      await (isLp ? lpMcp.ping() : hlMcp.ping());
      return { state: "connected", detail: "MCP answered get_sync_health." };
    },
  };
}

function supabaseProbe(id: "lp_supabase" | "hl_supabase"): ProbeSpec {
  const isLp = id === "lp_supabase";
  return {
    id,
    name: isLp ? "LP Supabase" : "HL Supabase",
    group: "data",
    async fn(): Promise<ProbeResult> {
      const url = isLp ? process.env.LP_SUPABASE_URL : process.env.HL_SUPABASE_URL;
      const key = isLp ? process.env.LP_SUPABASE_SERVICE_KEY : process.env.HL_SUPABASE_SERVICE_KEY;
      if (!url || !key) {
        return {
          state: "not_configured",
          detail: `Set ${isLp ? "LP_SUPABASE_URL + LP_SUPABASE_SERVICE_KEY" : "HL_SUPABASE_URL + HL_SUPABASE_SERVICE_KEY"} on the dashboard.`,
        };
      }
      // A one-row read, not a COUNT: system_events is hundreds of thousands
      // of rows and an exact count would make the probe the slow thing.
      const client = isLp ? lpService() : hlService();
      const table = isLp ? "system_events" : "sync_state";
      const { error } = await client.from(table).select("*").limit(1);
      if (error) return { state: "error", detail: `${table}: ${error.message}` };
      return { state: "connected", detail: `Answered a read on ${table}.` };
    },
  };
}

const STALE_AFTER_MIN = 120;

function ghlProbe(): ProbeSpec {
  return {
    id: "ghl",
    name: "GoHighLevel",
    group: "services",
    async fn(): Promise<ProbeResult> {
      const base = trimBase(process.env.HL_MCP_URL);
      if (!base) return { state: "not_configured", detail: "Set HL_MCP_URL on the dashboard." };
      const res = await fetch(`${base}/health`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      if (!res.ok) return { state: "error", detail: `HL MCP /health responded ${res.status}.` };
      const health = (await res.json()) as { ghl_configured?: boolean };
      if (!health.ghl_configured) {
        return { state: "not_configured", detail: "Set GHL_API_KEY + GHL_LOCATION_ID on HL MCP." };
      }
      // Reachability proxy: the HL cache is refreshed from GHL on a schedule,
      // so the freshest entity sync is the last time GHL actually answered.
      const raw = (await hlMcp.getSyncHealth()) as HlSyncHealthRaw;
      const times = (raw.sync_state ?? [])
        .map((s) => s.last_synced_at)
        .filter((x): x is string => typeof x === "string")
        .sort();
      const last = times.at(-1) ?? null;
      const mins = minutesSince(last);
      if (last === null || mins === null) {
        return { state: "unknown", detail: "Credentials set, but no entity has synced yet." };
      }
      if (mins > STALE_AFTER_MIN) {
        return {
          state: "degraded",
          detail: `Credentials set, but the last GHL sync was ${Math.round(mins / 60)}h ago.`,
          meta: { last_sync_at: last },
        };
      }
      return { state: "connected", detail: `Last GHL sync ${mins} min ago.`, meta: { last_sync_at: last } };
    },
  };
}

function n8nProbe(): ProbeSpec {
  return {
    id: "n8n",
    name: "n8n",
    group: "automation",
    async fn(): Promise<ProbeResult> {
      const base = trimBase(process.env.N8N_BASE_URL);
      if (!base) return { state: "not_configured", detail: "Set N8N_BASE_URL on the dashboard." };
      const res = await fetch(`${base}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      if (!res.ok) return { state: "error", detail: `/healthz responded ${res.status}.` };
      const secret = (process.env.N8N_WEBHOOK_SECRET ?? "").trim();
      return {
        state: "connected",
        detail: secret
          ? "Instance answered /healthz. Webhook secret set."
          : "Instance answered /healthz, but N8N_WEBHOOK_SECRET is unset so dashboard triggers are no-ops.",
      };
    },
  };
}

function railwayProbe(): ProbeSpec {
  return {
    id: "railway_hl",
    name: "Railway (HL MCP service)",
    group: "services",
    async fn(): Promise<ProbeResult> {
      if (!trimBase(process.env.HL_MCP_URL)) {
        return { state: "not_configured", detail: "Set HL_MCP_URL on the dashboard." };
      }
      const raw = (await hlMcp.getRailwayServiceStatus()) as RailwayStatusRaw;
      const node = raw.deployments?.edges?.[0]?.node ?? null;
      const s = node?.status ?? null;
      const name = raw.service?.name ?? raw.name ?? "hl-mcp";
      if (!s) return { state: "unknown", detail: `No deployment reported for ${name}.` };
      if (s === "SUCCESS") return { state: "connected", detail: `${name}: latest deploy succeeded.`, meta: { deployed_at: node?.createdAt ?? null } };
      if (s === "FAILED" || s === "CRASHED") return { state: "error", detail: `${name}: latest deploy ${s}.` };
      if (s === "BUILDING" || s === "DEPLOYING" || s === "INITIALIZING") {
        return { state: "degraded", detail: `${name}: deploy in progress (${s}).` };
      }
      return { state: "unknown", detail: `${name}: deployment status ${s}.` };
    },
  };
}

export async function getConnections(): Promise<ConnectorStatus[]> {
  const [local, remote] = await Promise.all([
    runAll([
      mcpPingProbe("lp_mcp"),
      mcpPingProbe("hl_mcp"),
      ghlProbe(),
      railwayProbe(),
      supabaseProbe("lp_supabase"),
      supabaseProbe("hl_supabase"),
      n8nProbe(),
    ]),
    lpIntegrationRows(),
  ]);
  return [...local, ...remote];
}
