import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { SnapshotStrip } from "@/components/scorecard/SnapshotStrip";
import { HeadlineStrip } from "@/components/scorecard/HeadlineStrip";
import { JumpNav } from "@/components/scorecard/JumpNav";
import { ScorecardAlerts } from "@/components/scorecard/ScorecardAlerts";
import { PaceHero } from "@/components/scorecard/PaceHero";
import { FunnelCard } from "@/components/scorecard/FunnelCard";
import { RatesCard } from "@/components/scorecard/RatesCard";
import { RevenueCard } from "@/components/scorecard/RevenueCard";
import { PerDayCard } from "@/components/scorecard/PerDayCard";
import { StatusCard } from "@/components/scorecard/StatusCard";
import { DetailsTable } from "@/components/scorecard/DetailsTable";
import { GlossaryCard } from "@/components/scorecard/GlossaryCard";
import { GoalEditor } from "@/components/scorecard/GoalEditor";
import { SourcePerformanceTable } from "@/components/scorecard/SourcePerformanceTable";
import { LeadCostTable } from "@/components/scorecard/LeadCostTable";
import { getScorecardForPeriod, getScorecardGoals } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar } from "@/lib/date/sellingDays";
import { buildScorecardVM } from "@/lib/scorecard/viewModel";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();
const MARKET = "REECE";

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; date?: string }>;
}) {
  const [user, ctx, { period, start, end }] = await Promise.all([
    requireUser(),
    getAccessContext(),
    searchParams,
  ]);
  const isAdmin = ctx?.isAdmin ?? false;

  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);

  const [view, sources, leadCost] = await Promise.all([
    getScorecardForPeriod(MARKET, resolved),
    getSourceScorecardForPeriod(MARKET, resolved),
    getLeadCostForPeriod(MARKET, resolved),
  ]);
  const goals = isAdmin ? await getScorecardGoals(MARKET) : null;

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard"
        subtitle={`Marketing & sales performance vs goal · ${resolved.label}.`}
      />

      <div className="space-y-4 p-6">
        <SectionHeader
          title="Scorecard"
          subtitle="Goal & variance vs plan — at a glance."
          action={<PeriodPicker />}
        />

        {!view ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No data for {resolved.label}.{" "}
                {resolved.source === "snapshot"
                  ? "The daily job writes a snapshot each morning — or trigger a backfill via "
                  : resolved.source === "aggregate"
                    ? "No stored monthly snapshots fall in this range yet. Backfill via "
                    : "The recompute could not be reached. Trigger it via "}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                  POST /n8n/admin/goal-scorecard-run
                </code>{" "}
                on the LP-MCP service.
              </p>
            </CardContent>
          </Card>
        ) : (
          (() => {
            const vm = buildScorecardVM(view, resolved);
            return (
              <>
                {!view.derived.reconciled && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    <strong className="font-semibold">PROVISIONAL — not reconciled.</strong>{" "}
                    These figures are computed from LP raw data and have not yet been reconciled
                    to the official LP report. Do not use for commitments.
                  </div>
                )}

                <SnapshotStrip vm={vm} />
                <HeadlineStrip vm={vm} />
                <JumpNav />

                <ScorecardAlerts
                  actuals={view.actuals}
                  derived={view.derived}
                  unmappedSources={sources?.unmapped_count ?? 0}
                  leadCost={leadCost}
                />

                <PaceHero vm={vm} />

                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  <FunnelCard vm={vm} />
                  <RatesCard vm={vm} />
                </div>

                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                  <RevenueCard vm={vm} />
                  <PerDayCard vm={vm} />
                </div>

                <StatusCard vm={vm} />
                <DetailsTable rows={vm.marketing} abbr={vm.abbr} />
                <GlossaryCard />

                {isAdmin && goals && (
                  <GoalEditor goals={goals} baselineNetSales={view.derived.goal.baseline_net_sales} />
                )}

                {/* Deep-dive tables retained from the prior scorecard, below the visual story. */}
                {sources && (
                  <SourcePerformanceTable
                    rows={sources.rows}
                    unmappedCount={sources.unmapped_count}
                    asOfDate={sources.as_of_date}
                    referenceClosePct={view.actuals.close_pct}
                    referenceNsli={view.actuals.nsli}
                  />
                )}

                {leadCost && (
                  <LeadCostTable
                    rows={leadCost.rows}
                    targetPct={leadCost.target_pct}
                    asOfDate={leadCost.as_of_date}
                    anyConnected={leadCost.any_connected}
                  />
                )}
              </>
            );
          })()
        )}
      </div>
    </>
  );
}
