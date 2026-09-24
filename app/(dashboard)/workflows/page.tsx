import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { StatTile } from "@/components/tiles/StatTile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { getWorkflowSummary } from "@/lib/queries/workflows";
import { WorkflowsIndex } from "@/components/workflows/WorkflowsIndex";

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
        subtitle="Every GHL workflow, grouped by where it sits in the funnel"
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
            <CardTitle>Workflows by funnel route</CardTitle>
            <InfoPopover helpKey="workflows.routeMap" />
          </CardHeader>
          <CardContent>
            {summary.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No workflows in the HL cache. Trigger a sync from the topbar.</p>
            ) : (
              <WorkflowsIndex rows={summary.rows} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
