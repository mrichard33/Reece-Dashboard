import type { Route } from "next";
import { Download } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker } from "@/components/scorecard/MarketPicker";
import { SpendTiles } from "@/components/marketing-spend/SpendTiles";
import { SpendTable } from "@/components/marketing-spend/SpendTable";
import { SpendTrend } from "@/components/marketing-spend/SpendTrend";
import { HeldSpend } from "@/components/marketing-spend/HeldSpend";
import { InvoicesPanel } from "@/components/marketing-spend/InvoicesPanel";
import { MarketingTabs } from "@/components/marketing-spend/MarketingTabs";
import { SourcesTab } from "@/components/marketing-spend/SourcesTab";
import { getMarketingSpend, getMarketingSpendTrend, getRecentInvoices, getHeldExpenses, visibleInvoices, invoicesForViewer } from "@/lib/queries/marketingCost";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import { normalizeMarketCode, marketLabel } from "@/lib/scorecard/markets";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();

/**
 * Marketing Spend (2026-10-19): EVERY marketing cost in the ledger, not only
 * lead sources. Scorecard › Sources & lead cost shows lead-source cost only;
 * software, call center, company-wide costs and held money live
 * here, by category → vendor → sub-source, one column per market. Also home
 * to held spend with its recommendation and to the Invoices tab (both moved
 * off the scorecard: the user, "the scorecard page is primarily for sales").
 * Same access as the scorecard sources page; the Apply button is admin only.
 *
 * 2026-10-23: Sources & lead cost (the Lead Cost table, ranked by Gross $) is
 * the first, default tab (the user: "should be under Marketing Spend as the
 * main tab"); Spend is `?tab=spend`, Invoices `?tab=invoices`, and the old
 * /scorecard/sources redirects here.
 */
export default async function MarketingSpendPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; market?: string; tab?: string; rejected?: string }>;
}) {
  const [user, { period, start, end, market, tab, rejected }] = await Promise.all([requireUser(), searchParams]);
  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";
  // Monthly only (the user, 2026-10-23: the weekly view "is not working"; the
  // Monthly / Weekly toggle is gone and an old ?grain=week link reads monthly).
  const GRAIN = "month" as const;
  const TAB: "sources" | "spend" | "invoices" = tab === "invoices" ? "invoices" : tab === "spend" ? "spend" : "sources";
  const SHOW_REJECTED = rejected === "1";
  const access = await getAccessContext().catch(() => null);

  const [spend, trend, held, invoices] = await Promise.all([
    TAB === "spend" ? getMarketingSpend({ market: MARKET, grain: GRAIN, periodStart: resolved.periodStart, periodEnd: resolved.periodEnd })
      .catch((err) => ({ view: null, needsMigration: false, error: (err as Error)?.message ?? String(err) })) : Promise.resolve(null),
    TAB === "spend" ? getMarketingSpendTrend(MARKET, resolved.periodEnd).catch(() => ({ byCategory: [], byMarket: [] })) : Promise.resolve({ byCategory: [], byMarket: [] }),
    TAB === "spend" && MARKET === "REECE" ? getHeldExpenses(resolved.periodStart, resolved.periodEnd).catch(() => []) : Promise.resolve([]),
    TAB === "invoices" ? getRecentInvoices().catch(() => ({ docs: [], needsMigration: false })) : Promise.resolve(null),
  ]);

  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { period, start, end, market, tab: TAB === "sources" ? undefined : TAB, rejected };
    for (const [k, v] of Object.entries({ ...cur, ...over })) if (v) p.set(k, v);
    const qs = p.toString();
    return `/marketing-spend${qs ? `?${qs}` : ""}` as Route;
  };
  const allDocs = invoices?.docs ?? [];
  // Admins only see the invoice text and open the file (bank details, 2026-10-19).
  const shownDocs = invoicesForViewer(visibleInvoices(allDocs, SHOW_REJECTED), !!access?.isAdmin);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Marketing Spend"
        subtitle={`Every marketing cost · ${marketLabel(MARKET)} · ${resolved.label}.`}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title={TAB === "sources" ? "Sources & lead cost" : "Marketing spend"}
          subtitle={TAB === "sources"
            ? "Where the leads come from: sales on each source's leads vs the cost of each issued lead."
            : "Lead sources (commissions included), software, call center and held money, by vendor and market."}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <MarketPicker />
              <PeriodPicker currentMonth={todayET().slice(0, 7)} />
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

        <MarketingTabs active={TAB} carry={{ period, start, end, market }} />

        {TAB === "sources" ? (
          <SourcesTab market={MARKET} resolved={resolved} spendHref={href({ tab: "spend", rejected: null })} />
        ) : TAB === "invoices" ? (
          <InvoicesPanel
            docs={shownDocs}
            needsMigration={invoices?.needsMigration ?? false}
            showRejected={SHOW_REJECTED}
            hiddenRejected={allDocs.length - shownDocs.length}
            toggleHref={href({ rejected: SHOW_REJECTED ? null : "1" })}
            canEdit={!!access?.isAdmin}
          />
        ) : (
          <>
            {spend?.needsMigration && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                The marketing cost ledger is not in this database yet.
              </p>
            )}
            {spend?.error && (
              <p className="rounded-md border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-700 dark:border-brick-900 dark:bg-brick-950/40 dark:text-brick-300">
                Marketing spend could not be read: {spend.error}
              </p>
            )}
            {spend?.view && <SpendTiles view={spend.view} />}

            <Card>
              <CardHeader>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Spend by category</h3>
                  <InfoPopover helpKey="marketingSpend.table" />
                  <span className="text-xs text-slate-400">Tap a row to see its vendors</span>
                </div>
              </CardHeader>
              <CardContent>
                {spend?.view ? <SpendTable view={spend.view} /> : null}
              </CardContent>
            </Card>

            {MARKET === "REECE" && (
              <Card>
                <CardHeader>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Held at company level</h3>
                    <InfoPopover helpKey="scorecard.heldSpend" />
                  </div>
                </CardHeader>
                <CardContent>
                  <HeldSpend held={held} canApply={!!access?.isAdmin} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">12-month spend · {marketLabel(MARKET)}</h3>
                  <InfoPopover helpKey="marketingSpend.trend" />
                </div>
              </CardHeader>
              <CardContent>
                <SpendTrend byCategory={trend.byCategory} byMarket={trend.byMarket} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
