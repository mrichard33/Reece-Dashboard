import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent } from "@/components/ui/Card";
import { ScorecardHeader } from "@/components/scorecard/ScorecardHeader";
import { FunnelTable } from "@/components/scorecard/FunnelTable";
import { PaceBlock } from "@/components/scorecard/PaceBlock";
import { VarianceBridge } from "@/components/scorecard/VarianceBridge";
import { GoalEditor } from "@/components/scorecard/GoalEditor";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { getScorecard, getScorecardGoals } from "@/lib/queries/scorecard";
import { resolvePeriod } from "@/lib/time";
import { relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MARKET = "REECE";

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const [user, ctx, sp] = await Promise.all([
    requireUser(),
    getAccessContext(),
    searchParams,
  ]);
  const isAdmin = ctx?.isAdmin ?? false;

  const period = resolvePeriod(sp);
  const view = await getScorecard(MARKET, {
    start: period.start.toISOString(),
    end: period.end.toISOString(),
  });
  const goals = isAdmin ? await getScorecardGoals(MARKET) : null;

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard"
        subtitle="Marketing & sales performance vs goal."
      />

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-navy-900 dark:text-white">
              {period.label}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {view?.lastSyncedAt
                ? `As of ${relTime(view.lastSyncedAt)} · source: live cache`
                : "source: live cache"}
            </p>
          </div>
          <PeriodPicker />
        </div>

        {!view ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No scorecard data for this period. The funnel counts read the live
                LP cache (`lp_leads`) — if this stays empty, check the LP sync.
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

            {view.warnings.length > 0 && (
              <div
                role="status"
                className="no-print rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400"
              >
                {view.warnings.map((w) => (
                  <p key={w}>· {w}</p>
                ))}
              </div>
            )}

            <ScorecardHeader
              actuals={view.actuals}
              goals={view.goals}
              derived={view.derived}
            />

            <FunnelTable
              actuals={view.actuals}
              goals={view.goals}
              derived={view.derived}
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <PaceBlock derived={view.derived} />
              <VarianceBridge derived={view.derived} />
            </div>

            {isAdmin && goals && <GoalEditor goals={goals} />}
          </>
        )}
      </div>
    </>
  );
}
