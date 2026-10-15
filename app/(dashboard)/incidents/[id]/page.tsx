import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { IncidentActions } from "@/components/health/HealthActions";
import { getIncident } from "@/lib/queries/incidents";
import {
  affectedLeads, formatDuration, SEVERITY_TONE, shapeTimeline, slackLink, STATUS_LABEL, statusTone, toIncidentRow,
} from "@/lib/queries/incidents.core";
import { plainTimes, severityWord } from "@/lib/health/words";
import { etDateTime, usd } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** One incident: what it costs, who is affected, its timeline, and the buttons. */
export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("operator");
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const loaded = await getIncident(id);
  if (loaded.state === "not_found") notFound();

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Incidents" subtitle={`#${id}`} />
      <div className="space-y-6 p-4 sm:p-6">
        {loaded.state !== "ok" ? (
          <Card><CardContent><p className="text-sm text-slate-600 dark:text-slate-300">{loaded.state === "missing" ? "The incident tables are not in the database yet." : `Could not read this incident: ${loaded.message}`}</p></CardContent></Card>
        ) : (() => {
          const { incident, events, checkLabel, knownIssue, finding } = loaded.data;
          const row = toIncidentRow(incident, loaded.nowMs);
          const leads = affectedLeads(incident.data);
          const slack = slackLink(incident.slack_channel, incident.slack_ts);
          return (
            <>
              <SectionHeader title={plainTimes(incident.title)} subtitle={`${checkLabel ?? incident.check_id} · opened ${etDateTime(incident.opened_at)} · open ${formatDuration(row.ageMin)}`} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[incident.severity] ?? "slate"}>{severityWord(incident.severity)}</Badge>
                <Badge tone={statusTone(incident.status)}>{STATUS_LABEL[incident.status] ?? incident.status}</Badge>
                {row.flapping && <Badge tone="brick">comes and goes</Badge>}
                {row.occurrences > 1 && <span className="text-xs text-slate-500">came back {row.occurrences - 1}x</span>}
                {incident.acknowledged_by && <span className="text-xs text-slate-500">acknowledged by {incident.acknowledged_by}</span>}
                {incident.snooze_until && incident.status === "snoozed" && <span className="text-xs text-slate-500">snoozed until {etDateTime(incident.snooze_until)}</span>}
              </div>

              <Card>
                <CardHeader><CardTitle>Impact</CardTitle><InfoPopover helpKey="incidents.impact" /></CardHeader>
                <CardContent>
                  <p className="break-words text-sm text-navy-900 dark:text-slate-100">{plainTimes(incident.summary ?? "—")}</p>
                  {incident.business_impact && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Why it matters: {plainTimes(incident.business_impact)}{row.valueAtRisk !== null ? ` (est ${usd(row.valueAtRisk)} at risk)` : ""}</p>}
                  <div className="mt-4"><IncidentActions id={incident.id} status={incident.status} acknowledged={!!incident.acknowledged_at} /></div>
                </CardContent>
              </Card>

              {leads.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Affected ({leads.length})</CardTitle><InfoPopover helpKey="incidents.affected" /></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-slate-500"><tr><th className="py-1 pr-3">Lead</th><th className="py-1 pr-3">Phone</th><th className="hidden py-1 pr-3 md:table-cell">Source</th><th className="py-1 pr-3">Waiting</th><th className="hidden py-1 md:table-cell">Est.</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {leads.map((l, i) => (
                            <tr key={`${l.lp_lead_id ?? i}`}>
                              <td className="py-1.5 pr-3">{l.name ?? "—"}{l.lp_lead_id ? <span className="block text-[11px] text-slate-400">LP {l.lp_lead_id}</span> : null}</td>
                              <td className="whitespace-nowrap py-1.5 pr-3">{l.phone10 ?? "—"}</td>
                              <td className="hidden py-1.5 pr-3 md:table-cell">{l.source ?? "—"}</td>
                              <td className="py-1.5 pr-3">{l.waiting_min != null ? formatDuration(l.waiting_min) : "—"}</td>
                              <td className="hidden py-1.5 md:table-cell">{l.est_value ? usd(l.est_value) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Timeline</CardTitle><InfoPopover helpKey="incidents.timeline" /></CardHeader>
                  <CardContent>
                    <ol className="space-y-2">
                      {shapeTimeline(events).map((e) => (
                        <li key={e.id} className="text-sm">
                          <span className="text-xs text-slate-500">{etDateTime(e.at)} · {e.who}</span>
                          <span className="block break-words text-navy-900 dark:text-slate-100">{e.what}{e.body ? ` — ${plainTimes(e.body)}` : ""}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
                <div className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle>Finding</CardTitle><InfoPopover helpKey="incidents.finding" /></CardHeader>
                    <CardContent><p className="break-words text-sm text-slate-600 dark:text-slate-300">{finding ?? "No investigation yet. AI investigation comes in a later phase."}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Proposed actions</CardTitle><InfoPopover helpKey="incidents.actions" /></CardHeader>
                    <CardContent><p className="text-sm text-slate-600 dark:text-slate-300">Nothing proposed yet. Proposed fixes come in a later phase.</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Links</CardTitle><InfoPopover helpKey="incidents.links" /></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <p><Link href={`/system-health/${encodeURIComponent(incident.check_id)}` as Route} className="underline">The check: {checkLabel ?? incident.check_id}</Link></p>
                      {slack ? <p><a href={slack} target="_blank" rel="noreferrer" className="underline">The Slack card</a></p> : <p className="text-slate-500">No Slack card (it is still inside its 10-minute wait, or the check is in test mode).</p>}
                      {knownIssue && <p className="break-words text-slate-600 dark:text-slate-300">Known issue #{knownIssue.id} ({knownIssue.status}): {knownIssue.description}</p>}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </>
  );
}
