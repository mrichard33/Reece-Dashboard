import { requireExecAdmin } from "@/components/shell/RoleGate";
import { getHealthSnapshot } from "@/lib/queries/health";
import { listFbWorkflows } from "@/lib/actions/settings";
import { listExecutives } from "@/lib/queries/approvals";
import { lpUrlConfigured, lpTokenConfigured } from "@/lib/mcp/lpClient";
import { hlUrlConfigured, hlTokenConfigured } from "@/lib/mcp/hlClient";
import { ConnectionsPanel, type ServiceConfig } from "@/components/settings/ConnectionsPanel";
import { AutomationControls } from "@/components/settings/AutomationControls";
import { TeamCard } from "@/components/settings/TeamCard";

export const dynamic = "force-dynamic";

/** Extract a "failed/total (rate)" 24h summary from the raw sync-health details. */
function failureSummary(sync: unknown): string | null {
  if (!sync || typeof sync !== "object") return null;
  const details = (sync as { details?: Record<string, unknown> }).details;
  if (!details) return null;
  // LP shape: last_24h { syncs_run, failed_syncs }
  const lp = details.last_24h as { syncs_run?: number; failed_syncs?: number } | undefined;
  if (lp && typeof lp.syncs_run === "number") {
    const total = lp.syncs_run;
    const failed = lp.failed_syncs ?? 0;
    const rate = total > 0 ? Math.round((failed / total) * 100) : 0;
    return `${failed}/${total} failed (${rate}%)`;
  }
  // HL shape: failure_rate_24h { total_syncs, failed_syncs, failure_rate }
  const hl = details.failure_rate_24h as
    | { total_syncs?: number; failed_syncs?: number; failure_rate?: string }
    | undefined;
  if (hl && typeof hl.total_syncs === "number") {
    const total = hl.total_syncs;
    const failed = hl.failed_syncs ?? 0;
    return `${failed}/${total} failed (${hl.failure_rate ?? `${total > 0 ? Math.round((failed / total) * 100) : 0}%`})`;
  }
  return null;
}

function lastSyncOf(sync: unknown): string | null {
  if (sync && typeof sync === "object" && "last_sync_at" in sync) {
    return (sync as { last_sync_at: string | null }).last_sync_at;
  }
  return null;
}

export default async function SettingsPage() {
  // Admin-only (Mark). Non-admin executives are redirected to /approvals.
  const ctx = await requireExecAdmin();

  const [health, workflows, execs] = await Promise.all([
    getHealthSnapshot(),
    listFbWorkflows(),
    listExecutives(),
  ]);

  const n8nConfigured = !!process.env.N8N_BASE_URL && !!process.env.N8N_WEBHOOK_SECRET;

  const services: ServiceConfig[] = [
    {
      key: "lp",
      label: "LP MCP",
      urlConfigured: lpUrlConfigured,
      tokenConfigured: lpTokenConfigured,
      lastSyncAt: lastSyncOf(health.lpSync),
      failure24h: failureSummary(health.lpSync),
    },
    {
      key: "hl",
      label: "HL MCP",
      urlConfigured: hlUrlConfigured,
      tokenConfigured: hlTokenConfigured,
      lastSyncAt: lastSyncOf(health.hlSync),
      failure24h: failureSummary(health.hlSync),
    },
  ];

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-slate-800 dark:text-slate-100">
          General Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Backend control surface — MCP connections, automation, and team roles. The
          Facebook Page connection and content-engine tuning live in{" "}
          <span className="font-medium">Content → Settings</span>.
        </p>
      </header>

      <div className="space-y-6">
        <ConnectionsPanel services={services} n8nConfigured={n8nConfigured} />
        <AutomationControls initial={workflows} />
        <TeamCard
          executives={execs}
          selfExecutiveId={ctx.executive?.id ?? null}
        />
      </div>
    </div>
  );
}
