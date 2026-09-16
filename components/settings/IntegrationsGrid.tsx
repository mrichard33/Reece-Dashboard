import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { InfoPopover } from "@/components/help/InfoPopover";
import { Tooltip } from "@/components/ui/Tooltip";
import { absTime, relTime } from "@/lib/utils";
import {
  badgeFor,
  dotFor,
  groupRows,
  summarize,
  summaryLine,
  type ConnectorStatus,
} from "@/lib/connections/types";
import { RecheckButton } from "@/components/settings/RecheckButton";

/**
 * Settings → Integrations. Server component: the rows arrive already probed
 * from lib/queries/connections.ts, and the only client piece is the Re-check
 * button. Grey means "not configured" or "could not tell", and neither is a
 * pass: only a probe that actually reached the service is green.
 */
export function IntegrationsGrid({ rows }: { rows: ConnectorStatus[] }) {
  const summary = summarize(rows);
  const groups = groupRows(rows);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Integrations</CardTitle>
          <InfoPopover helpKey="settings.integrations" />
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-slate-400">{summaryLine(summary)}</p>
          <RecheckButton />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.group}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.label}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.rows.map((r) => (
                  <IntegrationRow key={r.id} row={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationRow({ row }: { row: ConnectorStatus }) {
  const badge = badgeFor(row.state);
  return (
    <li
      data-state={row.state}
      className="rounded-md border border-slate-100 p-3 dark:border-slate-800"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={dotFor(row.state)} animate={row.state === "connected"} />
          <p className="truncate text-sm font-medium text-navy-900 dark:text-slate-100">{row.name}</p>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="mt-2 break-words text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
        {row.detail}
      </p>
      <Tooltip label={absTime(row.checkedAt)}>
        <p className="mt-1 text-[11px] text-slate-400">
          checked {relTime(row.checkedAt)}
          {typeof row.latencyMs === "number" ? ` · ${row.latencyMs} ms` : ""}
        </p>
      </Tooltip>
    </li>
  );
}
