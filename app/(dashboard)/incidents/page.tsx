import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { IncidentList } from "@/components/health/IncidentList";
import { getClosedIncidents, getOpenIncidents } from "@/lib/queries/incidents";
import {
  formatDuration, OPEN_STATUSES, shapeBoard, shapeClosed, STATUS_LABEL,
} from "@/lib/queries/incidents.core";
import { SYSTEMS } from "@/lib/queries/systemStatus.core";
import { plainTimes, severityWord } from "@/lib/health/words";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { tab?: string; status?: string; system?: string; severity?: string; mine?: string };

/**
 * Incidents — one row per open problem LP-MCP has found (2026-10-15), most
 * urgent first, then oldest. Severity shows as a word (Urgent / High / Medium /
 * Low); the URL keeps the P1..P4 code (?severity=P1). The Closed tab shows
 * the last 30 days with how long each took
 * to be acknowledged and resolved. Acting on one happens on its own page.
 */
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireRole("operator");
  const p = await searchParams;
  const closedTab = p.tab === "closed";
  const loaded = closedTab ? await getClosedIncidents() : await getOpenIncidents();
  const filters = {
    status: p.status && (OPEN_STATUSES as readonly string[]).includes(p.status) ? p.status : null,
    system: SYSTEMS.some((s) => s.id === p.system) ? p.system! : null,
    severity: ["P1", "P2", "P3", "P4"].includes(p.severity ?? "") ? p.severity! : null,
    mine: p.mine === "1" ? user.email : null,
  };
  const href = (over: Partial<Params>) => {
    const q = new URLSearchParams();
    const merged: Params = { ...p, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/incidents${s ? `?${s}` : ""}` as Route;
  };

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Incidents" subtitle="What is broken right now" />
      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader title="Incidents" subtitle="One row per problem, most urgent first. Each one has a single Slack message that is updated as things change." />

        <div className="flex flex-wrap gap-2">
          <Chip href={href({ tab: undefined })} active={!closedTab}>Open</Chip>
          <Chip href={href({ tab: "closed", status: undefined })} active={closedTab}>Closed (30 days)</Chip>
          <span className="mx-1 hidden w-px bg-slate-200 sm:block dark:bg-slate-700" />
          {["P1", "P2", "P3"].map((s) => (
            <Chip key={s} href={href({ severity: filters.severity === s ? undefined : s })} active={filters.severity === s}>{severityWord(s)}</Chip>
          ))}
          <Chip href={href({ mine: filters.mine ? undefined : "1" })} active={!!filters.mine}>Acknowledged by me</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          {SYSTEMS.map((s) => (
            <Chip key={s.id} href={href({ system: filters.system === s.id ? undefined : s.id })} active={filters.system === s.id}>{s.label}</Chip>
          ))}
          {!closedTab && ["open", "acknowledged", "verifying", "snoozed"].map((s) => (
            <Chip key={s} href={href({ status: filters.status === s ? undefined : s })} active={filters.status === s}>{STATUS_LABEL[s]}</Chip>
          ))}
        </div>

        {loaded.state !== "ok" ? (
          <Card><CardContent><p className="text-sm text-slate-600 dark:text-slate-300">{loaded.state === "missing" ? "The incident tables are not in the database yet (LP-MCP migration 20261015120000)." : `Could not read incidents: ${loaded.message}`}</p></CardContent></Card>
        ) : closedTab ? (
          <ClosedList rows={shapeClosed(loaded.data, loaded.nowMs)} filters={filters} />
        ) : (
          <Card>
            <CardHeader><CardTitle>Open incidents</CardTitle><InfoPopover helpKey="incidents.board" /></CardHeader>
            <CardContent><IncidentList rows={shapeBoard(loaded.data, loaded.nowMs, filters)} empty="Nothing open. Every live check is passing." /></CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Chip({ href, active, children }: { href: Route; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(
      "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs",
      active ? "border-navy-700 bg-navy-800 text-white dark:border-sky-400 dark:bg-sky-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
    )}>
      {children}
    </Link>
  );
}

function ClosedList({ rows, filters }: { rows: ReturnType<typeof shapeClosed>; filters: { system: string | null; severity: string | null; mine: string | null } }) {
  const list = rows.rows.filter((r) => (!filters.system || r.system === filters.system) && (!filters.severity || r.severity === filters.severity) && (!filters.mine || r.acknowledgedBy === filters.mine));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Closed in the last 30 days</CardTitle>
        <InfoPopover helpKey="incidents.closed" />
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Typical time to acknowledge: <strong>{formatDuration(rows.medianTtaMin)}</strong> · to resolve: <strong>{formatDuration(rows.medianTtrMin)}</strong>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">Incident</th><th className="py-1 pr-3">Ended</th><th className="hidden py-1 pr-3 md:table-cell">To acknowledge</th><th className="py-1">To resolve</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-3"><Link href={`/incidents/${r.id}` as Route} className="break-words underline">{severityWord(r.severity)} · {plainTimes(r.title)}</Link></td>
                  <td className="py-2 pr-3 text-xs">{r.statusLabel}</td>
                  <td className="hidden py-2 pr-3 text-xs md:table-cell">{formatDuration(r.ttaMin)}</td>
                  <td className="py-2 text-xs">{formatDuration(r.ttrMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <p className="py-4 text-sm text-slate-500">Nothing closed in the last 30 days.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
