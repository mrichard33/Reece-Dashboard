import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker } from "@/components/scorecard/MarketPicker";
import { ByMarketTable } from "@/components/scorecard/ByMarketTable";
import { ExpectedOutcomePanel, CohortQualityPanel } from "@/components/scorecard/CohortPanels";
import {
  fetchCurrentCohorts,
  foldCohortsByMonth,
  settledNetRetention,
  periodCohortTotals,
} from "@/lib/queries/cohorts";
import { getScorecardForPeriod } from "@/lib/queries/scorecard";
import { getByMarket } from "@/lib/queries/byMarket";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import { marketLabel, normalizeMarketCode } from "@/lib/scorecard/markets";
import { buildScorecardVM } from "@/lib/scorecard/viewModel";
import { RevenueCard } from "@/components/scorecard/RevenueCard";
import { ScSection } from "@/components/scorecard/ScSection";
import { fetchReportFactRows } from "@/lib/queries/reportFacts";
import { buildReportFacts } from "@/lib/queries/reportFacts.core";

export const dynamic = "force-dynamic";

const SELLING_CAL = resolveSellingCalendar();

/**
 * Cohorts & market detail — everything the meeting view moved off /scorecard.
 *
 * NOTHING here is new and nothing on the meeting tab was deleted: the panels,
 * their props and the queries behind them are the same ones /scorecard ran
 * before 2026-09-04, rendered on the same market/period resolution so the
 * figures are identical on both routes. See lib/scorecard/meetingView.ts for
 * which flag hides which panel.
 *
 * Admin-only. These are modeled and month-by-month diagnostic surfaces — the
 * questions they answer are not the ones a sales manager is asking in a Monday
 * meeting, which is the whole reason they moved.
 */
export default async function ScorecardDetailPage({
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
  // Legacy/source codes (LAKE_MKT) collapse onto their display market (Orlando).
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";
  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  const currentMonthET = todayET().slice(0, 7);

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/scorecard"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
      >
        <ArrowLeft size={13} /> Scorecard
      </Link>
      {isAdmin && <MarketPicker />}
      {isAdmin && <PeriodPicker currentMonth={currentMonthET} />}
    </div>
  );

  if (!isAdmin) {
    return (
      <>
        <TopBar
          email={user.email}
          role={user.role}
          title="Scorecard · Detail"
          subtitle="Cohorts & market detail."
        />
        <div className="space-y-4 p-4 sm:p-6">
          <SectionHeader
            title="Cohorts & market detail"
            subtitle="Admin only."
            action={controls}
          />
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                You don&apos;t have access to this page. The meeting scorecard is at{" "}
                <Link href="/scorecard" className="text-navy-700 hover:underline dark:text-sky-300">
                  /scorecard
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // Same fetches, same failure posture as /scorecard: a single failing query
  // degrades to an empty panel rather than 500ing the page.
  const [view, byMarket, allCohorts, factRows] = await Promise.all([
    getScorecardForPeriod(MARKET, resolved).catch((err) => {
      console.error(`[scorecard/detail] view ${MARKET} failed:`, (err as Error)?.message ?? err);
      return null;
    }),
    getByMarket(resolved).catch((err) => {
      console.error("[scorecard/detail] byMarket failed:", (err as Error)?.message ?? err);
      return { rows: [], total: null, unrouted: null };
    }),
    fetchCurrentCohorts(),
    // Report facts for the Production section (134 released, 133 backlog).
    // Never rejects — a failure yields [] and the panels read "not yet sourced".
    fetchReportFactRows(),
  ]);

  // §7: sum the market's rows and derive from the summed numerator and
  // denominator — never an average of the markets' rates. Identical fold to the
  // meeting tab's, which is what makes the two pages agree.
  const cohortRows = MARKET === "REECE" ? allCohorts : allCohorts.filter((c) => c.market === MARKET);
  const companyCohorts = foldCohortsByMonth(cohortRows);
  const settledNetRetentionM = settledNetRetention(companyCohorts, resolved.asOf);
  const periodTotals = periodCohortTotals(companyCohorts, resolved.periodStart, resolved.periodEnd);
  const currentCohortGrossCents = periodTotals.grossCents;
  // The latest OBSERVATION across cohorts — "when did we last look at any of
  // this". Correct for the maturation panels and for nothing else.
  const cohortObservedOn = companyCohorts.reduce<string | null>(
    (max, c) => (max == null || c.observedOn > max ? c.observedOn : max),
    null,
  );

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Scorecard · Detail"
        subtitle={`${marketLabel(MARKET)} · ${resolved.label} · cohorts & market detail.`}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title="Cohorts & market detail"
          subtitle="Moved off the meeting scorecard — same data, same numbers."
          action={controls}
        />

        {!view ? (
          <Card>
            <CardContent>
              <p className="py-8 text-center text-sm text-slate-500">
                No scorecard data for {resolved.label} yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          (() => {
            // `abbr` and `pace.monthlyGoal` name the period and its goal for the
            // cohort panels; `revenue.facts` feeds the Production section below.
            // The reporting-clock argument the meeting tab threads in shapes the
            // pace tiles, which this page does not render.
            //
            // Report facts now feed the Production section (released + backlog),
            // projected exactly as the meeting page does.
            const vm = buildScorecardVM(
              view,
              resolved,
              buildReportFacts(factRows, resolved, MARKET),
              SELLING_CAL,
            );
            return (
              <>
                <ExpectedOutcomePanel
                  grossWrittenCents={currentCohortGrossCents}
                  monthlyGoalDollars={vm.pace.monthlyGoal}
                  rate={settledNetRetentionM}
                  abbr={vm.abbr}
                  asOf={cohortObservedOn}
                />

                <CohortQualityPanel cohorts={companyCohorts} asOf={cohortObservedOn} />

                {byMarket.rows.length > 0 && <ByMarketTable data={byMarket} abbr={vm.abbr} />}

                {/* Production — moved off the meeting scorecard (ruling
                    2026-09-18). Production-clock figures; never compared with
                    this period's sales. */}
                <ScSection id="sc-production" label="Production" meta="not tied to this period's sales">
                  <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800/70 sm:px-5">
                    <RevenueCard vm={vm} panels="production" />
                  </div>
                </ScSection>

                {!view.derived.reconciled && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    <strong className="font-semibold">PROVISIONAL — not reconciled.</strong>{" "}
                    Not yet reconciled to an official LP export. These figures come from
                    report 137 raw data.
                  </div>
                )}
              </>
            );
          })()
        )}
      </div>
    </>
  );
}
