import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { getWorkflowSummary } from "@/lib/queries/workflows";
import { loadWorkflowPrefs } from "@/lib/queries/workflowPrefs";
import { WorkflowsIndex } from "@/components/workflows/WorkflowsIndex";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const user = await requireRole("operator");
  const [summary, prefs] = await Promise.all([getWorkflowSummary(), loadWorkflowPrefs()]);
  const noSends = summary.rows.filter((r) => r.status === "published" && r.sending?.verdict === "no_sends_seen").length;
  const turnedOff = summary.rows.filter((r) => r.status === "published" && r.sending?.verdict === "turned_off").length;

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Workflows"
        subtitle="Every GHL workflow, grouped by where it sits in the funnel"
        syncNow
      />

      <div className="space-y-6 p-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatTile
            label="Total"
            value={summary.total}
            helpKey="workflows.total"
          />
          <StatTile label="Published" value={summary.published} helpKey="workflows.total" />
          <StatTile label="Draft" value={summary.draft} helpKey="workflows.total" />
          <StatTile label="Messages turned off" value={turnedOff} helpKey="workflows.turnedOff" />
          <StatTile label="No sends seen" value={"error" in summary.sendActivity ? "—" : noSends} helpKey="workflows.noSends" />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Workflows by funnel route</CardTitle>
            <InfoPopover helpKey="workflows.routeMap" />
            <Link href={"/workflows/review" as Route} className="ml-auto text-sm text-sky-700 hover:underline dark:text-sky-400">
              Funnel review →
            </Link>
          </CardHeader>
          <CardContent>
            {summary.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No workflows in the HL cache. Trigger a sync from the topbar.</p>
            ) : (
              <WorkflowsIndex rows={summary.rows} favorites={prefs.favorites} presets={prefs.presets} sendActivity={summary.sendActivity} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
