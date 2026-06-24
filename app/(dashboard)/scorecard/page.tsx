import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { ScorecardHeader } from "@/components/scorecard/ScorecardHeader";
import { FunnelTable } from "@/components/scorecard/FunnelTable";
import { PaceBlock } from "@/components/scorecard/PaceBlock";
import { VarianceBridge } from "@/components/scorecard/VarianceBridge";
import { GoalEditor } from "@/components/scorecard/GoalEditor";
import { SourcePerformanceTable } from "@/components/scorecard/SourcePerformanceTable";
import { LeadCostTable } from "@/components/scorecard/LeadCostTable";
import { FreshnessStrip } from "@/components/scorecard/FreshnessStrip";
import { ScorecardAlerts } from "@/components/scorecard/ScorecardAlerts";
import { TieOutPanel } from "@/components/scorecard/TieOutPanel";
import { PeriodControls } from "@/components/scorecard/PeriodControls";
import { getScorecardForPeriod, getScorecardGoals } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import {
  resolveSellingCalendar,
  lastCompletedSellingDay,
  todayET,
} from "@/lib/date/sellingDays";

export const dynamic = "force-dynamic";

// Selling-day calendar (server env) — used to flag a stale snapshot when the
// daily LP-MCP job hasn't advanced as-of to the last completed selling day.
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

      <div className="space-y-6 p-6">
        <PeriodControls />

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
          <>
            {!view.derived.reconciled && (
              <div
                role="status"
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
              >
                <strong className="font-semibold">PROVISIONAL — not reconciled.</strong>{" "}
                These figures are computed from LP raw data and have not yet been
                reconciled to the official LP report. Do not use for commitments.
              </div>
            )}

            <FreshnessStrip
              asOfDate={view.actuals.as_of_date}
              createdAt={view.actuals.created_at}
              periodStart={view.actuals.period_start}
              periodEnd={view.actuals.period_end}
              rawLeadsIn={view.actuals.raw_leads_in}
              rawLeadsBasis={view.actuals.raw_inputs?.raw_leads_basis}
              reconciled={view.derived.reconciled}
              daysElapsed={view.actuals.days_elapsed}
              workingDaysInPeriod={view.actuals.working_days_in_period}
              expectedAsOf={lastCompletedSellingDay(todayET(), SELLING_CAL)}
              periodLabel={resolved.label}
              isPartial={resolved.isPartial}
              staleCheck={resolved.source === "snapshot"}
            />

            <ScorecardHeader
              actuals={view.actuals}
              goals={view.goals}
              derived={view.derived}
            />

            <ScorecardAlerts
              actuals={view.actuals}
              derived={view.derived}
              unmappedSources={sources?.unmapped_count ?? 0}
              leadCost={leadCost}
            />

            <FunnelTable
              actuals={view.actuals}
              goals={view.goals}
              derived={view.derived}
            />

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

            <div className="grid gap-6 lg:grid-cols-2">
              <PaceBlock derived={view.derived} />
              <VarianceBridge derived={view.derived} />
            </div>

            {isAdmin && <TieOutPanel actuals={view.actuals} />}

            {isAdmin && goals && (
              <GoalEditor
                goals={goals}
                baselineNetSales={view.derived.goal.baseline_net_sales}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
