import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { HealthTile } from "@/components/tiles/HealthTile";
import { AlertTile } from "@/components/tiles/AlertTile";
import { SyncFreshnessBanner } from "@/components/tiles/SyncFreshnessBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { ActivityList } from "@/components/activity/ActivityList";
import {
  getHealthSnapshot,
  heartbeatStatus,
  syncStatus,
  syncFreshnessLabel,
  railwayStatus,
} from "@/lib/queries/health";
import { getHeadlineStats, deltaText } from "@/lib/queries/headlineStats";
import { getRecentActivity, getActiveAlerts } from "@/lib/queries/activity";
import { num } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await requireUser();
  const [health, stats, activity, alerts] = await Promise.all([
    getHealthSnapshot(),
    getHeadlineStats(),
    getRecentActivity(20),
    getActiveAlerts(10),
  ]);

  const lpSyncLast = "error" in health.lpSync ? null : health.lpSync.last_sync_at;
  const hlSyncLast = "error" in health.hlSync ? null : health.hlSync.last_sync_at;

  const leadsDelta = deltaText(stats.leadsToday, stats.leadsYesterday);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Mission Control"
        subtitle="System health, pipeline flow, and active alerts"
      />

      <div className="space-y-6 p-6">
        <SyncFreshnessBanner lpLastSync={lpSyncLast} hlLastSync={hlSyncLast} />

        {/* Row 1 — Service health */}
        <section>
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            System health
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <HealthTile
              label="LP MCP"
              status={railwayStatus(health.lpMcp)}
              detail={
                "error" in health.lpMcp
                  ? "Status unavailable"
                  : `${health.lpMcp.service ?? "lp-mcp"} · ${health.lpMcp.status}`
              }
              lastActivity={"error" in health.lpMcp ? null : health.lpMcp.last_deploy_at}
              lastError={"error" in health.lpMcp ? health.lpMcp.error : null}
              helpKey="overview.lpMcp"
            />
            <HealthTile
              label="HL MCP"
              status={railwayStatus(health.hlMcp)}
              detail={
                "error" in health.hlMcp
                  ? "Status unavailable"
                  : `${health.hlMcp.service ?? "hl-mcp"} · ${health.hlMcp.status}`
              }
              lastActivity={"error" in health.hlMcp ? null : health.hlMcp.last_deploy_at}
              lastError={"error" in health.hlMcp ? health.hlMcp.error : null}
              helpKey="overview.hlMcp"
            />
            <HealthTile
              label="Decision Engine"
              status={heartbeatStatus(health.heartbeat.minutesAgo)}
              detail={
                health.heartbeat.lastTickAt
                  ? `Last tick ${num(health.heartbeat.minutesAgo)} min ago`
                  : "No ticks recorded"
              }
              lastActivity={health.heartbeat.lastTickAt}
              helpKey="overview.heartbeat"
            />
            <HealthTile
              label="Supabase sync"
              status={
                worstStatus(syncStatus(health.lpSync), syncStatus(health.hlSync))
              }
              detail={`LP: ${"error" in health.lpSync ? "—" : syncFreshnessLabel(health.lpSync)} · HL: ${"error" in health.hlSync ? "—" : syncFreshnessLabel(health.hlSync)}`}
              lastActivity={mostRecent(lpSyncLast, hlSyncLast)}
              lastError={syncTileError(health)}
              helpKey="overview.syncHealth"
            />
          </div>
        </section>

        {/* Row 2 — Headline stats */}
        <section>
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Today
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Leads today"
              value={num(stats.leadsToday)}
              delta={leadsDelta.text}
              deltaTone={leadsDelta.tone}
              helpKey="overview.leadsToday"
            />
            <StatTile
              label="Appts today"
              value={num(stats.appointmentsToday)}
              helpKey="overview.appointmentsToday"
            />
            <StatTile
              label="Opps in flight"
              value={num(stats.oppsInFlight)}
              helpKey="overview.oppsInFlight"
            />
            <StatTile
              label="Pending approvals"
              value={num(stats.pendingApprovals)}
              suffix={stats.pendingApprovals > 0 ? " !" : undefined}
              deltaTone={stats.pendingApprovals > 0 ? "amber" : "slate"}
              helpKey="overview.pendingApprovals"
            />
            <StatTile
              label="Open issues"
              value={num(stats.openIssues)}
              suffix={stats.openIssues > 0 ? " !" : undefined}
              deltaTone={stats.openIssues > 0 ? "rose" : "slate"}
              helpKey="overview.openIssues"
            />
          </div>
        </section>

        {/* Row 3 — Activity + Alerts */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <InfoPopover helpKey="overview.activity" />
            </CardHeader>
            <CardContent>
              <ActivityList items={activity} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active alerts</CardTitle>
              <InfoPopover helpKey="overview.alerts" />
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No active alerts.
                </p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((issue) => (
                    <li key={issue.id}>
                      <AlertTile issue={issue} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

function worstStatus(
  a: "healthy" | "warning" | "critical" | "neutral",
  b: "healthy" | "warning" | "critical" | "neutral",
): "healthy" | "warning" | "critical" | "neutral" {
  const order = ["critical", "warning", "neutral", "healthy"] as const;
  const aIdx = order.indexOf(a);
  const bIdx = order.indexOf(b);
  return order[Math.min(aIdx, bIdx)] ?? "neutral";
}

function mostRecent(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

function syncTileError(health: { lpSync: unknown; hlSync: unknown }): string | null {
  const lpErr =
    health.lpSync && typeof health.lpSync === "object" && "error" in health.lpSync
      ? (health.lpSync as { error: string }).error
      : null;
  const hlErr =
    health.hlSync && typeof health.hlSync === "object" && "error" in health.hlSync
      ? (health.hlSync as { error: string }).error
      : null;
  if (lpErr && hlErr) return `LP: ${lpErr} · HL: ${hlErr}`;
  if (lpErr) return `LP: ${lpErr}`;
  if (hlErr) return `HL: ${hlErr}`;
  return null;
}
