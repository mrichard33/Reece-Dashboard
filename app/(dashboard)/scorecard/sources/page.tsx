import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
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
import { InvoicesPanel } from "@/components/scorecard/InvoicesPanel";
import { ApplyHoldForm } from "@/components/scorecard/ApplyHoldForm";
import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import { getSourceScorecardForPeriod } from "@/lib/queries/sources";
import { getLeadCostForPeriod } from "@/lib/queries/leadcost";
import { getMarketingCostTrend, getRecentInvoices, getHeldExpenses } from "@/lib/queries/marketingCost";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import { normalizeMarketCode, marketLabel } from "@/lib/scorecard/markets";
import { usDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();
const TABS = [
  { key: "costs", label: "Sources & lead cost" },
  { key: "invoices", label: "Invoices" },
] as const;

/**
 * Sources & lead cost — the per-source deep-dive tables moved off the main
 * scorecard (Part D2). Shares the period picker and, since 2026-10-12, the
 * market picker: the Lead Cost table reads the marketing cost ledger
 * (v_market_subsource_cost) for ONE market or the company roll-up, by month
 * or ISO week, with the 12-month trend, the Brad-format download and the
 * Invoices sub-tab.
 */
export default async function ScorecardSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; market?: string; grain?: string; tab?: string }>;
}) {
  const [user, { period, start, end, market, grain, tab }] = await Promise.all([requireUser(), searchParams]);
  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";
  const GRAIN: "month" | "week" = grain === "week" ? "week" : "month";
  const TAB = tab === "invoices" ? "invoices" : "costs";
  const access = await getAccessContext().catch(() => null);

  // Wrapped so a single failing fetch degrades to the empty state instead of 500ing
  // the page (mirrors the main scorecard page). The source table stays on the
  // REECE snapshot (lp_source_scorecard_daily holds only company rows today).
  const [view, sources, leadCost, trend, invoices, held] = await Promise.all([
    getScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] view failed:", (err as Error)?.message ?? err); return null; }),
    getSourceScorecardForPeriod("REECE", resolved).catch((err) => { console.error("[sources] source scorecard failed:", (err as Error)?.message ?? err); return null; }),
    getLeadCostForPeriod(MARKET, resolved, GRAIN).catch((err) => { console.error("[sources] lead cost failed:", (err as Error)?.message ?? err); return null; }),
    getMarketingCostTrend(MARKET, resolved.periodEnd).catch(() => []),
    TAB === "invoices" ? getRecentInvoices().catch(() => ({ docs: [], needsMigration: false })) : Promise.resolve(null),
    access?.isAdmin ? getHeldExpenses(resolved.periodStart, resolved.periodEnd).catch(() => []) : Promise.resolve([]),
  ]);

  const tabHref = (key: string) => {
    const p = new URLSearchParams();
    if (period) p.set("period", period);
    if (start) p.set("start", start);
    if (end) p.set("end", end);
    if (market) p.set("market", market);
    if (grain) p.set("grain", grain);
    if (key !== "costs") p.set("tab", key);
    const qs = p.toString();
    return `/scorecard/sources${qs ? `?${qs}` : ""}` as Route;
  };

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
                title="Latest Brad-format XLSX for this market (7-day link)"
              >
                <Download size={13} /> Download Brad report
              </a>
            </div>
          }
        />

        <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={
                TAB === t.key
                  ? "border-b-2 border-navy-700 px-3 py-2 text-sm font-medium text-navy-900 dark:border-slate-200 dark:text-slate-100"
                  : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {TAB === "invoices" ? (
          <InvoicesPanel docs={invoices?.docs ?? []} needsMigration={invoices?.needsMigration ?? false} />
        ) : (
          <>
            <LeadCostTable
              view={leadCost?.view ?? null}
              targetPct={leadCost?.target_pct ?? 15}
              needsMigration={leadCost?.needsMigration ?? false}
              error={leadCost?.error ?? (leadCost ? null : "the ledger did not answer")}
            />
            {access?.isAdmin && held.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Held spend — apply a recommendation</h3>
                    <InfoPopover helpKey="scorecard.heldSpend" />
                  </div>
                </CardHeader>
                <CardContent>
                  <ApplyHoldForm held={held} />
                </CardContent>
              </Card>
            )}
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
          </>
        )}
      </div>
    </>
  );
}
