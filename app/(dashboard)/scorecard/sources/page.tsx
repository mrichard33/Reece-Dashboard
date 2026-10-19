import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker } from "@/components/scorecard/MarketPicker";
import { CostGrainToggle } from "@/components/scorecard/CostGrainToggle";
import { SourcePerformanceTable } from "@/components/scorecard/SourcePerformanceTable";
import { LeadCostTable } from "@/components/scorecard/LeadCostTable";
import { CostTrend } from "@/components/scorecard/CostTrend";
import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { getMarketingCostTrend } from "@/lib/queries/marketingCost";
import { CATEGORY_LABEL, OTHER_CATEGORIES } from "@/lib/queries/marketingSpend.core";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import { normalizeMarketCode, marketLabel } from "@/lib/scorecard/markets";
import { usDate, usdExact } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();

/**
 * Sources & lead cost — the per-source deep-dive tables moved off the main
 * scorecard (Part D2). Shares the period picker and, since 2026-10-12, the
 * market picker: the Lead Cost table reads the marketing cost ledger
 * (v_market_subsource_cost) for ONE market or the company roll-up, by month
 * or ISO week, with the 12-month trend and the report download.
 *
 * 2026-10-19: Lead Cost is lead sources only. Software, Call Center,
 * Company-wide and commissions are one "Other marketing costs" line linking
 * to /marketing-spend, which also took the Invoices tab (an old
 * `?tab=invoices` link redirects there) and the held spend with its
 * "Apply recommendation" (the user: this page is for sales).
 */
export default async function ScorecardSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; market?: string; grain?: string; tab?: string }>;
}) {
  const [user, { period, start, end, market, grain, tab }] = await Promise.all([requireUser(), searchParams]);
  const carry = new URLSearchParams();
  if (period) carry.set("period", period);
  if (start) carry.set("start", start);
  if (end) carry.set("end", end);
  if (market) carry.set("market", market);
  if (grain) carry.set("grain", grain);
  if (tab === "invoices") {
    carry.set("tab", "invoices");
    redirect(`/marketing-spend?${carry.toString()}` as Route);
  }
  const spendHref = `/marketing-spend${carry.size ? `?${carry.toString()}` : ""}` as Route;
  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";
  const GRAIN: "month" | "week" = grain === "week" ? "week" : "month";

  // Wrapped so a single failing fetch degrades to the empty state instead of 500ing
  // the page (mirrors the main scorecard page). The source table stays on the
  // REECE snapshot (lp_source_scorecard_daily holds only company rows today).
  const [view, sources, leadCost, trend] = await Promise.all([
    getScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] view failed:", (err as Error)?.message ?? err); return null; }),
    getSourceScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] source scorecard failed:", (err as Error)?.message ?? err); return null; }),
    getLeadCostForPeriod(MARKET, resolved, GRAIN).catch((err) => { console.error("[sources] lead cost failed:", (err as Error)?.message ?? err); return null; }),
    getMarketingCostTrend(MARKET, resolved.periodEnd).catch(() => []),
  ]);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard · Sources"
        subtitle={`Per-source performance & lead cost · ${marketLabel(MARKET)} · ${resolved.label}.`}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title="Sources & lead cost"
          subtitle="Where the leads come from — quality vs the cost of each issued lead."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/scorecard"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
              >
                <ArrowLeft size={13} /> Scorecard
              </Link>
              <MarketPicker />
              <PeriodPicker currentMonth={todayET().slice(0, 7)} />
              <CostGrainToggle active={GRAIN} />
              <a
                href={`/api/marketing-report?market=${encodeURIComponent(MARKET)}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
                title="Latest XLSX report for this market (7-day link)"
              >
                <Download size={13} /> Download Report
              </a>
            </div>
          }
        />

        {leadCost?.other && leadCost.other.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span className="min-w-0 break-words">
              Other marketing costs this period:{" "}
              <span className="font-mono font-semibold tabular text-slate-900 dark:text-slate-100">{usdExact(leadCost.other.total)}</span>{" "}
              <span className="text-slate-500 dark:text-slate-400">
                ({OTHER_CATEGORIES.filter((c) => leadCost.other!.by[c] > 0).map((c) => `${CATEGORY_LABEL[c].toLowerCase()} ${usdExact(leadCost.other!.by[c])}`).join(", ")})
              </span>
            </span>
            <Link href={spendHref} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-navy-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800 sm:h-7">
              Marketing Spend <ArrowRight size={13} />
            </Link>
          </div>
        )}

        <LeadCostTable
          view={leadCost?.view ?? null}
          targetPct={leadCost?.target_pct ?? 15}
          needsMigration={leadCost?.needsMigration ?? false}
          error={leadCost?.error ?? (leadCost ? null : "the ledger did not answer")}
        />
        <Card>
          <CardHeader>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">12-month cost trend · {marketLabel(MARKET)}</h3>
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
      </div>
    </>
  );
}
