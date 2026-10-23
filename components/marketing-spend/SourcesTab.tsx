import type { Route } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { SourcePerformanceTable } from "@/components/scorecard/SourcePerformanceTable";
import { LeadCostTable } from "@/components/scorecard/LeadCostTable";
import { CostTrend } from "@/components/scorecard/CostTrend";
import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { getMarketingCostTrend } from "@/lib/queries/marketingCost";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { marketLabel } from "@/lib/scorecard/markets";
import { usDate } from "@/lib/utils";

/**
 * Sources & lead cost — the main tab of Marketing Spend since 2026-10-23 (the
 * user: it "should be under Marketing Spend as the main tab"; it used to be
 * Scorecard › Sources, which now redirects here). The Lead Cost table (ranked
 * by Gross $, quiet sources collapsed), the 12-month cost trend and the source
 * performance table, read exactly as the old page read them.
 */
export async function SourcesTab({
  market,
  resolved,
  spendHref,
}: {
  market: string;
  resolved: ResolvedPeriod;
  spendHref: Route;
}) {
  // Wrapped so a single failing fetch degrades to the empty state instead of
  // 500ing the page. The source table stays on the REECE snapshot
  // (lp_source_scorecard_daily holds only company rows today).
  const [view, sources, leadCost, trend] = await Promise.all([
    getScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] view failed:", (err as Error)?.message ?? err); return null; }),
    getSourceScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] source scorecard failed:", (err as Error)?.message ?? err); return null; }),
    getLeadCostForPeriod(market, resolved, "month").catch((err) => { console.error("[sources] lead cost failed:", (err as Error)?.message ?? err); return null; }),
    getMarketingCostTrend(market, resolved.periodEnd).catch(() => []),
  ]);

  return (
    <>
      <LeadCostTable
        view={leadCost?.view ?? null}
        targetPct={leadCost?.target_pct ?? 15}
        needsMigration={leadCost?.needsMigration ?? false}
        error={leadCost?.error ?? (leadCost ? null : "the ledger did not answer")}
        spendHref={spendHref}
      />
      <Card>
        <CardHeader>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">12-month cost trend · {marketLabel(market)}</h3>
            <InfoPopover helpKey="scorecard.costTrend" />
          </div>
        </CardHeader>
        <CardContent>
          <CostTrend data={trend} />
        </CardContent>
      </Card>

      {sources && (
        <SourcePerformanceTable
          rows={sources.rows}
          unmappedCount={sources.unmapped_count}
          asOfDate={usDate(sources.as_of_date)}
          referenceClosePct={view?.actuals.close_pct ?? null}
          referenceNsli={view?.actuals.nsli ?? null}
        />
      )}
    </>
  );
}
