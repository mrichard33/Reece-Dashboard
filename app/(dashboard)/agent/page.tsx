import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { StatTile } from "@/components/tiles/StatTile";
import { InfoPopover } from "@/components/help/InfoPopover";
import { getAgentPageData, JOB_RUNS_MIGRATION } from "@/lib/queries/agent";
import { heartbeatStatus } from "@/lib/queries/health";
import {
  formatDuration,
  jobBadge,
  jobDot,
  jobSummaryLine,
  summarizeJobs,
  type JobRow,
} from "@/lib/queries/agent.core";
import type { AgentRule } from "@/lib/supabase/types";
import { absTime, relTime } from "@/lib/utils";

/**
 * /agent — the Decision Engine, live.
 *
 * Read-only. The rules on this page are database config and the only sanctioned
 * way to change one is the LP MCP tool, so there are no buttons here; reloading
 * the engine lives in Settings.
 *
 * The job roster is the new half. Until LP-MCP sql/113 shipped, every scheduled
 * job kept its last result in memory and lost it on each deploy, so a job that
 * quietly stopped happening was invisible. A registered job that has never run
 * shows up amber as "Never run" rather than being absent — that row is the
 * whole point.
 */

export const dynamic = "force-dynamic";

const rowClass = "hover:bg-slate-50 dark:hover:bg-slate-800/50";
const cellClass = "py-2 pr-3";

export default async function AgentPage() {
  const user = await requireRole("operator");
  const data = await getAgentPageData();

  const v = data.vitals;
  const hb = heartbeatStatus(data.heartbeat.minutesAgo);
  const n = (x: number | null) => (x === null ? "—" : x);

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Decision Engine" />

      <div className="space-y-6 p-6">
        <SectionHeader
          title="Decision Engine"
          subtitle="Rules, action throughput, and the background jobs that keep the system fed."
        />

        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Engine
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Active rules" value={n(v.activeRules)} helpKey="agent.activeRules" />
            <StatTile
              label="Inactive"
              value={n(v.inactiveRules)}
              deltaTone="slate"
              helpKey="agent.inactiveRules"
            />
            <StatTile
              label="Events queued"
              value={n(v.pendingEvents)}
              deltaTone="amber"
              helpKey="agent.pendingEvents"
            />
            <StatTile
              label="Actions queued"
              value={n(v.pendingActions)}
              deltaTone="amber"
              helpKey="agent.pendingActions"
            />
            <StatTile
              label="Executed (24h)"
              value={n(v.executed24h)}
              helpKey="agent.executed24h"
            />
            <StatTile
              label="Failed (24h)"
              value={n(v.failed24h)}
              deltaTone="rose"
              suffix={typeof v.failed24h === "number" && v.failed24h > 0 ? "!" : undefined}
              helpKey="agent.failed24h"
            />
          </div>
          {data.errors.vitals && (
            <div className="mt-3">
              <ErrBanner label="engine vitals" msg={data.errors.vitals} />
            </div>
          )}
        </section>

        <HeartbeatCard
          lastTickAt={data.heartbeat.lastTickAt}
          minutesAgo={data.heartbeat.minutesAgo}
          status={hb}
        />

        <JobsCard
          jobs={data.jobs}
          needsMigration={data.jobsNeedMigration}
          error={data.errors.jobs}
        />

        <RulesCard rules={data.rules} error={data.errors.rules} />
      </div>
    </>
  );
}

function HeartbeatCard({
  lastTickAt,
  minutesAgo,
  status,
}: {
  lastTickAt: string | null;
  minutesAgo: number | null;
  status: ReturnType<typeof heartbeatStatus>;
}) {
  const word =
    status === "healthy"
      ? "within SLA"
      : status === "warning"
        ? "running late"
        : status === "critical"
          ? "stalled"
          : "unknown";
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <CardTitle>Heartbeat</CardTitle>
        </div>
        <InfoPopover helpKey="agent.heartbeat" />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          Last engine activity{" "}
          <Tooltip label={absTime(lastTickAt)}>
            <span className="font-medium">{lastTickAt ? relTime(lastTickAt) : "—"}</span>
          </Tooltip>{" "}
          <span className="text-slate-500">({word})</span>
        </p>
        {minutesAgo !== null && minutesAgo > 15 && (
          <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
            Nothing has been written to system_events for {minutesAgo} minutes. Automations are
            probably not firing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function JobsCard({
  jobs,
  needsMigration,
  error,
}: {
  jobs: JobRow[];
  needsMigration: boolean;
  error?: string;
}) {
  if (needsMigration) {
    return (
      <Card>
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
            The job roster needs migration 113
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Apply
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
              {JOB_RUNS_MIGRATION.file}
            </code>
            from the {JOB_RUNS_MIGRATION.repo} repo in the LP Supabase SQL editor and reload. It
            creates the roster, the run history and the view this card reads. Until then the
            background jobs still run — nothing records what they did.
          </p>
        </CardContent>
      </Card>
    );
  }

  const summary = summarizeJobs(jobs);

  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <CardTitle>Background jobs</CardTitle>
          <InfoPopover helpKey="agent.jobs" />
        </div>
        <Badge tone={summary.failing > 0 ? "rose" : summary.attention > 0 ? "amber" : "slate"}>
          {jobSummaryLine(summary)}
        </Badge>
      </CardHeader>
      <CardContent>
        {error && <ErrBanner label="job roster" msg={error} />}
        {jobs.length === 0 && !error ? (
          <Empty>No jobs registered yet. The LP MCP service writes this roster when it boots.</Empty>
        ) : (
          <Table head={["Job", "Cadence", "Last run", "Took", "Status", "What happened"]}>
            {jobs.map((j) => {
              const badge = jobBadge(j.health);
              return (
                <tr key={j.id} className={rowClass}>
                  <td className={cellClass}>
                    <div className="flex items-center gap-2">
                      <StatusDot status={jobDot(j.health)} animate={j.health === "running"} />
                      <div>
                        <p className="font-medium text-navy-900 dark:text-slate-100">{j.label}</p>
                        <p className="text-[11px] text-slate-400">{j.group}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${cellClass} text-slate-500`}>{j.cadence ?? "—"}</td>
                  <td className={cellClass}>
                    {j.lastStartedAt ? (
                      <Tooltip label={absTime(j.lastStartedAt)}>
                        <span>{relTime(j.lastStartedAt)}</span>
                      </Tooltip>
                    ) : (
                      <span className="text-slate-400">never</span>
                    )}
                  </td>
                  <td className={`${cellClass} tabular text-slate-500`}>
                    {formatDuration(j.lastElapsedMs)}
                  </td>
                  <td className={cellClass}>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                  <td className={`${cellClass} text-slate-600 dark:text-slate-300`}>
                    {j.health === "disabled" ? (
                      <span className="text-slate-400">
                        switched off{j.disabledBy ? ` by ${j.disabledBy}` : ""}
                      </span>
                    ) : j.health === "never" ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        registered, but has not run yet
                      </span>
                    ) : (
                      <span className="break-words">{j.lastSummary ?? "—"}</span>
                    )}
                    {j.runs24h > 0 && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        · {j.runs24h} run{j.runs24h === 1 ? "" : "s"} in 24h
                        {j.failed24h > 0 ? `, ${j.failed24h} failed` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard({ rules, error }: { rules: AgentRule[]; error?: string }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <CardTitle>Rules</CardTitle>
          <InfoPopover helpKey="agent.rules" />
        </div>
        <Badge tone="slate">{rules.length} shown</Badge>
      </CardHeader>
      <CardContent>
        {error && <ErrBanner label="rules" msg={error} />}
        {rules.length === 0 && !error ? (
          <Empty>No rules found.</Empty>
        ) : (
          <Table head={["Rule", "Category", "Priority", "Approval", "State", "Updated"]}>
            {rules.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className={cellClass}>
                  <p className="font-medium text-navy-900 dark:text-slate-100">{r.rule_name}</p>
                  <p className="font-mono text-[11px] text-slate-400">{r.rule_key}</p>
                </td>
                <td className={`${cellClass} text-slate-500`}>{r.category ?? "—"}</td>
                <td className={`${cellClass} tabular text-slate-500`}>{r.priority ?? "—"}</td>
                <td className={cellClass}>
                  {r.requires_approval ? (
                    <Badge tone="amber">Needs approval</Badge>
                  ) : (
                    <span className="text-slate-400">automatic</span>
                  )}
                </td>
                <td className={cellClass}>
                  {r.enabled ? (
                    <Badge tone="emerald">Active</Badge>
                  ) : (
                    <Badge tone="slate">Inactive</Badge>
                  )}
                </td>
                <td className={`${cellClass} text-slate-500`}>
                  {r.updated_at ? relTime(r.updated_at) : "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            {head.map((h) => (
              <th key={h} className="pb-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-slate-500">{children}</p>;
}

function ErrBanner({ label, msg }: { label: string; msg: string }) {
  return (
    <div className="mb-3 flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950">
      <StatusDot status="critical" animate={false} />
      <p className="break-words text-[11px] text-rose-700 dark:text-rose-300">
        <span className="font-semibold">{label} check failed:</span> {msg}
      </p>
    </div>
  );
}
