import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { getWorkflowSummary } from "@/lib/queries/workflows";
import { relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const user = await requireRole("operator");
  const summary = await getWorkflowSummary();

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Workflows"
        subtitle="GHL workflow inventory with canonical registry metadata"
        syncNow
      />

      <div className="space-y-6 p-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Total"
            value={summary.total}
            helpKey="workflows.total"
          />
          <StatTile label="Published" value={summary.published} helpKey="workflows.total" />
          <StatTile label="Draft" value={summary.draft} helpKey="workflows.total" />
          <StatTile
            label="Registered"
            value={summary.withCanonicalCode}
            suffix={`/${summary.total}`}
            helpKey="workflows.total"
          />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>All workflows</CardTitle>
            <InfoPopover helpKey="workflows.healthFlags" />
          </CardHeader>
          <CardContent>
            {summary.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No workflows in the HL cache. Trigger a sync from the topbar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">Workflow</th>
                      <th className="py-2 pr-3">Family</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Last modified</th>
                      <th className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1">
                          Last execution
                          <InfoPopover helpKey="workflows.lastExecution" align="left" />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-200">
                    {summary.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 pr-3 font-mono text-xs">
                          {r.canonicalCode ?? (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{r.name}</td>
                        <td className="py-2 pr-3">
                          {r.stageFamily ? (
                            <Badge tone="navy">{r.stageFamily}</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            tone={r.status === "published" ? "emerald" : "slate"}
                            dot
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-500">
                          {relTime(r.lastModified)}
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-400">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
