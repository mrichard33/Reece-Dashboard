import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { HealthTile } from "@/components/tiles/HealthTile";
import { McpStatusTile } from "@/components/tiles/McpStatusTile";
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
import { PaidMediaSection } from "@/components/leadgurus/PaidMediaSection";
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
        syncNow
      />

      <div className="space-y-6 p-6">
        <SyncFreshnessBanner lpLastSync={lpSyncLast} hlLastSync={hlSyncLast} />

        {/* Row 1 — Service health */}
        <section>
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            System health
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {"error" in health.lpMcp ? (
              <McpStatusTile label="LP MCP" error={health.lpMcp} helpKey="overview.lpMcp" />
            ) : (
              <HealthTile
                label="LP MCP"
                status={railwayStatus(health.lpMcp)}
                detail={`${health.lpMcp.service ?? "lp-mcp"} · ${health.lpMcp.status}`}
                lastActivity={health.lpMcp.last_deploy_at}
                lastActivityLabel="Synced"
                helpKey="overview.lpMcp"
              />
            )}
            {"error" in health.hlMcp ? (
              <McpStatusTile label="HL MCP" error={health.hlMcp} helpKey="overview.hlMcp" />
            ) : (
              <HealthTile
                label="HL MCP"
                status={railwayStatus(health.hlMcp)}
                detail={`${health.hlMcp.service ?? "hl-mcp"} · ${health.hlMcp.status}`}
                lastActivity={health.hlMcp.last_deploy_at}
                lastActivityLabel="Deployed"
                helpKey="overview.hlMcp"
              />
            )}
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
          <h2 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Today
            <span
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
              title="Intraday live-cache counts for the current day. Partial and still changing — these never feed the scorecard's goal/pace math, which reports complete through the last selling day."
            >
              live · partial
            </span>
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
              label="Opps in flight (30d)"
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

        {/* Row 3 — Paid Media (Lead Gurus) */}
        <PaidMediaSection />

        {/* Row 4 — Activity + Alerts */}
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
