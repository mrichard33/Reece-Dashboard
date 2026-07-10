import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker, marketLabel } from "@/components/scorecard/MarketPicker";
import { PaceHero } from "@/components/scorecard/PaceHero";
import { FunnelGoalTable } from "@/components/scorecard/FunnelGoalTable";
import { RevenueCard } from "@/components/scorecard/RevenueCard";
import { PerDayCard } from "@/components/scorecard/PerDayCard";
import { ByMarketTable } from "@/components/scorecard/ByMarketTable";
import { EditGoalsPanel } from "@/components/scorecard/EditGoalsPanel";
import { getScorecardForPeriod, getScorecardGoalsForEditor } from "@/lib/queries/scorecard";
import { getByMarket } from "@/lib/queries/byMarket";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar } from "@/lib/date/sellingDays";
import { buildScorecardVM } from "@/lib/scorecard/viewModel";
import { usDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; market?: string }>;
}) {
  const [user, ctx, { period, start, end, market }] = await Promise.all([
    requireUser(),
    getAccessContext(),
    searchParams,
  ]);
  const isAdmin = ctx?.isAdmin ?? false;
  const MARKET = market || "REECE";

  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);

  const [view, byMarket] = await Promise.all([
    getScorecardForPeriod(MARKET, resolved).catch((err) => {
      console.error(`[scorecard] view ${MARKET} failed:`, (err as Error)?.message ?? err);
      return null;
    }),
    getByMarket(resolved),
  ]);
  const goalsEditor = isAdmin ? await getScorecardGoalsForEditor() : null;

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <MarketPicker />
      <PeriodPicker />
      {view && (
        <span
          className="inline-flex h-7 items-center rounded-md bg-slate-100 px-2.5 font-mono text-[11px] font-medium tabular text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          title="Data current through this date."
        >
          as of {usDate(view.actuals.as_of_date)}
        </span>
      )}
      {isAdmin && goalsEditor && (
        <EditGoalsPanel data={goalsEditor} initialMarket={MARKET} />
      )}
      <Link
        href="/scorecard/sources"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
      >
        <BarChart3 size={13} /> Sources & lead cost
      </Link>
    </div>
  );

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard"
        subtitle={`${marketLabel(MARKET)} · ${resolved.label} · marketing & sales vs goal.`}
      />

      <div className="space-y-4 p-6">
        <SectionHeader
          title="Scorecard"
          subtitle="Goal & variance vs plan — one screen."
          action={controls}
        />

        {!view ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No data for {resolved.label}.{" "}
                {resolved.source === "snapshot"
                  ? "The daily job writes a snapshot each morning — or trigger a backfill via "
                  : "No stored monthly snapshots fall in this range yet. Backfill via "}
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

                {/* ① Goal & Pace */}
                <PaceHero vm={vm} />

                {/* ② Funnel vs Goal */}
                <FunnelGoalTable view={view} />

                {/* ③ Sold vs Net + ④ Per-Day Pace — one row (Sold · Net · Per-Day) */}
                <RevenueCard vm={vm} aside={<PerDayCard vm={vm} />} />

                {/* ⑤ By Market — every market for the period; rows sum to All Markets. */}
                {byMarket.rows.length > 0 && <ByMarketTable data={byMarket} />}
              </>
            );
          })()
        )}
      </div>
    </>
  );
}
