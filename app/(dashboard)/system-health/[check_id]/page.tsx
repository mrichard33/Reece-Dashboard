import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { CheckResultsChart } from "@/components/health/CheckResultsChart";
import { RunChecksButton } from "@/components/health/HealthActions";
import { getCheckDetail } from "@/lib/queries/systemHealth";
import { leadLeaksLink, thresholdLines } from "@/lib/queries/systemHealth.core";
import { STATUS_LABEL, SEVERITY_TONE, statusTone } from "@/lib/queries/incidents.core";
import { dotClass } from "@/lib/queries/systemStatus.core";
import { plainTimes, severityWord, statusWord } from "@/lib/health/words";
import { cn, etShort, relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** One check: what it asks, its last 100 results against its thresholds, and its incidents. */
export default async function CheckPage({ params }: { params: Promise<{ check_id: string }> }) {
  const user = await requireRole("operator");
  const { check_id: raw } = await params;
  const checkId = decodeURIComponent(raw);
  const page = await getCheckDetail(checkId);
  if (page.state === "not_found") notFound();

  return (
    <>
      <TopBar email={user.email} role={user.role} title="System health" subtitle={page.state === "ok" ? page.check.label : "One check"} />
      <div className="space-y-6 p-4 sm:p-6">
        {page.state !== "ok" ? (
          <Card><CardContent><p className="text-sm text-slate-600 dark:text-slate-300">{page.state === "missing" ? "The health views are not in the database yet." : `Could not read this check: ${page.message}`}</p></CardContent></Card>
        ) : (
          <>
            <SectionHeader
              title={page.check.label}
              subtitle={`${plainTimes(page.check.question)} · How often: ${plainTimes(page.check.cadence)}`}
              action={<RunChecksButton checkId={page.check.id} />}
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cn("inline-block h-3 w-3 rounded-full", dotClass(page.check.color, page.check.hollow))} aria-hidden />
              {(page.check.status === "warn" || page.check.status === "fail") && !page.check.comingLater && (
                <Badge tone={SEVERITY_TONE[page.check.severity] ?? "slate"}>{severityWord(page.check.severity)}</Badge>
              )}
              <span className="break-words text-slate-700 dark:text-slate-200">{page.check.comingLater ? "Coming later" : plainTimes(page.check.staleNote ?? page.check.summary ?? "No result yet")}</span>
              {page.check.observedAt && <span className="text-xs text-slate-500">{relTime(page.check.observedAt)}</span>}
              {leadLeaksLink(page.check.id) && (
                <Link href={leadLeaksLink(page.check.id) as Route} className="text-sm font-medium text-navy-700 underline dark:text-sky-300">See the leads on Lead Leaks</Link>
              )}
            </div>

            <Card>
              <CardHeader><CardTitle>Last 100 results</CardTitle><InfoPopover helpKey="systemHealth.check.chart" /></CardHeader>
              <CardContent>
                {(() => {
                  const t = thresholdLines(page.config);
                  return <CheckResultsChart results={page.results} warn={t.warn} fail={t.fail} unit={t.key} />;
                })()}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="py-1 pr-3">When (ET)</th><th className="py-1 pr-3">Status</th><th className="hidden py-1 pr-3 md:table-cell">Value</th><th className="py-1">Summary</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[...page.results].reverse().slice(0, 20).map((r) => (
                        <tr key={r.at}>
                          <td className="whitespace-nowrap py-1 pr-3">{etShort(r.at)}</td>
                          <td className="py-1 pr-3">{statusWord(r.status)}</td>
                          <td className="hidden py-1 pr-3 md:table-cell">{r.value ?? "—"}</td>
                          <td className="break-words py-1">{plainTimes(r.summary ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Incidents</CardTitle><InfoPopover helpKey="systemHealth.check.incidents" /></CardHeader>
                <CardContent>
                  {page.incidents.length === 0 ? <p className="text-sm text-slate-500">No incident for this check yet.</p> : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {page.incidents.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                          <Badge tone={SEVERITY_TONE[i.severity] ?? "slate"}>{severityWord(i.severity)}</Badge>
                          <Link href={`/incidents/${i.id}` as Route} className="min-w-0 flex-1 break-words font-medium underline">{plainTimes(i.title)}</Link>
                          <Badge tone={statusTone(i.status)}>{STATUS_LABEL[i.status] ?? i.status}</Badge>
                          <span className="text-xs text-slate-500">{relTime(i.opened_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Rules and thresholds</CardTitle><InfoPopover helpKey="systemHealth.check.config" /></CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Turns yellow when:</span> {plainTimes(page.check.warnRule)}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Turns red when:</span> {plainTimes(page.check.failRule)}</p>
                  {page.check.businessImpact && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300"><span className="font-semibold">Why it matters:</span> {plainTimes(page.check.businessImpact)}</p>}
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 p-3 text-[11px] dark:bg-slate-800/60">{JSON.stringify(page.config ?? {}, null, 2)}</pre>
                  <p className="mt-2 text-[11px] text-slate-400">Run by {page.check.owner ?? "its legacy alert"} · thresholds live in health_checks.config</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
