import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { SourcePerformanceTable } from "@/components/scorecard/SourcePerformanceTable";
import { LeadCostTable } from "@/components/scorecard/LeadCostTable";
import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import { usDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();
const MARKET = "REECE";

/**
 * Sources & lead cost — the per-source deep-dive tables moved off the main
 * scorecard (Part D2). Shares the same period picker so the tables track the
 * selected window.
 */
export default async function ScorecardSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const [user, { period, start, end }] = await Promise.all([requireUser(), searchParams]);
  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);

  // Wrapped so a single failing fetch degrades to the empty state instead of 500ing
  // the page (mirrors the main scorecard page).
  const [view, sources, leadCost] = await Promise.all([
    getScorecardForPeriod(MARKET, resolved).catch((err) => {
      console.error("[sources] view failed:", (err as Error)?.message ?? err);
      return null;
    }),
    getSourceScorecardForPeriod(MARKET, resolved).catch((err) => {
      console.error("[sources] source scorecard failed:", (err as Error)?.message ?? err);
      return null;
    }),
    getLeadCostForPeriod(MARKET, resolved).catch((err) => {
      console.error("[sources] lead cost failed:", (err as Error)?.message ?? err);
      return null;
    }),
  ]);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard · Sources"
        subtitle={`Per-source performance & lead cost · ${resolved.label}.`}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title="Sources & lead cost"
          subtitle="Where the leads come from — quality vs cost."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/scorecard"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
              >
                <ArrowLeft size={13} /> Scorecard
              </Link>
              <PeriodPicker currentMonth={todayET().slice(0, 7)} />
            </div>
          }
        />

        {!sources && !leadCost ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No source data for {resolved.label}.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {sources && (
              <SourcePerformanceTable
                rows={sources.rows}
                unmappedCount={sources.unmapped_count}
                asOfDate={usDate(sources.as_of_date)}
                referenceClosePct={view?.actuals.close_pct ?? null}
                referenceNsli={view?.actuals.nsli ?? null}
              />
            )}

            {leadCost && (
              <LeadCostTable
                rows={leadCost.rows}
                targetPct={leadCost.target_pct}
                asOfDate={usDate(leadCost.as_of_date)}
                anyConnected={leadCost.any_connected}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
