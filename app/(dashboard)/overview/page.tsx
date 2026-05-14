import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { HealthTile } from "@/components/tiles/HealthTile";
import { AlertTile } from "@/components/tiles/AlertTile";
import { SyncFreshnessBanner } from "@/components/tiles/SyncFreshnessBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { Badge } from "@/components/ui/Badge";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  getHealthSnapshot,
  heartbeatStatus,
  syncStatus,
  railwayStatus,
} from "@/lib/queries/health";
import { getHeadlineStats, deltaText } from "@/lib/queries/headlineStats";
import { getRecentActivity, getActiveAlerts } from "@/lib/queries/activity";
import { absTime, num, relTime } from "@/lib/utils";

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
              detail={`LP: ${"error" in health.lpSync ? "—" : health.lpSync.status} · HL: ${"error" in health.hlSync ? "—" : health.hlSync.status}`}
              lastActivity={mostRecent(lpSyncLast, hlSyncLast)}
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
              {activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  No recent system events.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activity.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-2">
                      <Badge
                        tone={priorityTone(e.priority)}
                        dot
                        className="mt-0.5 flex-shrink-0"
                      >
                        {e.priority ?? "normal"}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-navy-900 dark:text-slate-100">
                          <span className="font-mono text-[11px] text-slate-500">
                            {e.event_type}
                          </span>{" "}
                          {e.entity_type && (
                            <span className="text-slate-700 dark:text-slate-300">
                              {e.entity_type}
                              {e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ""}
                            </span>
                          )}
                        </p>
                        <Tooltip label={absTime(e.created_at)}>
                          <p className="text-[11px] text-slate-500">
                            {relTime(e.created_at)}
                          </p>
                        </Tooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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

function priorityTone(
  p: "low" | "normal" | "high" | "critical" | null,
): "slate" | "sky" | "amber" | "rose" {
  switch (p) {
    case "critical":
      return "rose";
    case "high":
      return "amber";
    case "low":
      return "slate";
    default:
      return "sky";
  }
}
