import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker } from "@/components/scorecard/MarketPicker";
import { EditGoalsPanel } from "@/components/scorecard/EditGoalsPanel";
import { ViewSelector } from "@/components/scorecard/tiers/ViewSelector";
import { Tier1TheNumber } from "@/components/scorecard/tiers/Tier1TheNumber";
import { Tier2Cascade } from "@/components/scorecard/tiers/Tier2Cascade";
import { Tier3Leakage } from "@/components/scorecard/tiers/Tier3Leakage";
import { Tier4Efficiency } from "@/components/scorecard/tiers/Tier4Efficiency";
import { Tier5Backlog } from "@/components/scorecard/tiers/Tier5Backlog";
import { DailyBoard } from "@/components/scorecard/tiers/DailyBoard";
import { marketLabel, normalizeMarketCode } from "@/lib/scorecard/markets";
import { getScorecardGoalsForEditor } from "@/lib/queries/scorecard";
import { getTierBundle } from "@/lib/queries/tiers";
import { resolveCadence } from "@/lib/scorecard/tiers/cadence";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import {
  resolveSellingCalendar,
  sellingDaysElapsed,
  sellingDaysInPeriod,
  todayET,
} from "@/lib/date/sellingDays";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();

/**
 * The five-tier scorecard.
 *
 * Organized around DECISIONS, not data sources. Each tier answers one question,
 * sits on ONE date basis declared in its own header, and pages ONE owner:
 *
 *   1  The Number          RTP milestone   → are we making the month?
 *   2  Where it's breaking appointment     → which stage, and who owns it?
 *   3  Revenue leakage     sold cohort     → where do sold dollars go?
 *   4  Marketing efficiency lead cohort    → what do we pay, how hard do we buy?
 *   5  Backlog             point in time   → what is open right now?
 *
 * Tiers are stacked, never placed side by side, so two different date bases are
 * never adjacent — the implied comparability of a side-by-side layout is the
 * reason the numbers "never matched".
 */
export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    start?: string;
    end?: string;
    market?: string;
    view?: string;
  }>;
}) {
  const [user, ctx, { period, start, end, market, view }] = await Promise.all([
    requireUser(),
    getAccessContext(),
    searchParams,
  ]);
  const isAdmin = ctx?.isAdmin ?? false;
  // Legacy/source codes (LAKE_MKT) collapse onto their display market (Orlando).
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";

  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  const currentMonthET = todayET().slice(0, 7);
  const { cadence, fromRole } = resolveCadence(view, ctx);

  const elapsedSellingDays = sellingDaysElapsed(resolved.periodStart, resolved.asOf, SELLING_CAL);
  const totalSellingDays = sellingDaysInPeriod(
    resolved.periodStart,
    resolved.periodEnd,
    SELLING_CAL,
  );

  const bundle = await getTierBundle(MARKET, {
    elapsedSellingDays,
    totalSellingDays,
    periodLabel: resolved.label,
    // A year view prices the cascade off the YTD snapshot; every other view
    // wants the month's own flow.
    flowScope: resolved.key === "ytd" ? "ytd" : "mtd",
  }).catch((err) => {
    console.error("[scorecard] tier bundle failed:", (err as Error)?.message ?? err);
    return null;
  });

  const goalsEditor = isAdmin
    ? await getScorecardGoalsForEditor().catch((err) => {
        console.error("[scorecard] goals editor failed:", (err as Error)?.message ?? err);
        return null;
      })
    : null;

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <ViewSelector active={cadence.key} fromRole={fromRole} />
      <MarketPicker />
      {cadence.key !== "daily" && <PeriodPicker currentMonth={currentMonthET} />}
      {isAdmin && goalsEditor && <EditGoalsPanel data={goalsEditor} initialMarket={MARKET} />}
      <Link
        href="/scorecard/sources"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
      >
        <BarChart3 size={13} /> Sources &amp; lead cost
      </Link>
    </div>
  );

  const shows = (tier: number) => cadence.tiers.includes(tier);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard"
        subtitle={`${marketLabel(MARKET)} · ${cadence.label} · ${cadence.audience}.`}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title="Scorecard"
          subtitle={cadence.blurb}
          action={controls}
        />

        {!bundle ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                Could not load the report facts. Older data is unaffected — if this persists, the
                LP-MCP ingest may be stalled; trigger a backfill via{" "}
                <code className="break-words rounded bg-slate-100 px-1 dark:bg-slate-800">
                  POST /n8n/admin/goal-scorecard-run
                </code>
                .
              </p>
            </CardContent>
          </Card>
        ) : cadence.key === "daily" ? (
          <DailyBoard data={bundle.daily} />
        ) : (
          <>
            {shows(1) && <Tier1TheNumber data={bundle.tier1} />}
            {shows(2) && <Tier2Cascade data={bundle.tier2} />}
            {shows(3) && <Tier3Leakage data={bundle.tier3} />}
            {shows(4) && (
              <Tier4Efficiency data={bundle.tier4} showSources={cadence.showsSourceRoi} />
            )}
            {shows(5) && <Tier5Backlog data={bundle.tier5} />}
          </>
        )}
      </div>
    </>
  );
}
