import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireUser } from "@/components/shell/RoleGate";
import { getAccessContext } from "@/lib/auth";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { PeriodPicker } from "@/components/scorecard/PeriodPicker";
import { MarketPicker } from "@/components/scorecard/MarketPicker";
import { marketLabel } from "@/lib/scorecard/markets";
import { PaceHero } from "@/components/scorecard/PaceHero";
import { FunnelGoalTable } from "@/components/scorecard/FunnelGoalTable";
import { RevenueCard } from "@/components/scorecard/RevenueCard";
import { PerDayCard } from "@/components/scorecard/PerDayCard";
import { ByMarketTable } from "@/components/scorecard/ByMarketTable";
import { ExpectedOutcomePanel, CohortQualityPanel } from "@/components/scorecard/CohortPanels";
import { EditGoalsPanel } from "@/components/scorecard/EditGoalsPanel";
import {
  fetchCurrentCohorts,
  foldCohortsByMonth,
  historicalMatureNsaRate,
  netSalesCents,
} from "@/lib/queries/cohorts";
import { getScorecardForPeriod, getScorecardGoalsForEditor } from "@/lib/queries/scorecard";
import { getByMarket } from "@/lib/queries/byMarket";
import { getReportFacts, getPartialCoverage } from "@/lib/queries/reportFacts";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { lastCompletedSellingDay, resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
import {
  freshnessChip,
  stalenessSellingDays,
  stalenessCalendarDays,
  stalenessPhraseFull,
} from "@/lib/scorecard/freshness";
import { normalizeMarketCode } from "@/lib/scorecard/markets";
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
  // Legacy/source codes (LAKE_MKT) collapse onto their display market (Orlando).
  const MARKET = market ? normalizeMarketCode(market) || "REECE" : "REECE";

  const resolved = resolvePeriod(period, { start, end }, SELLING_CAL);
  // ET current month (YYYY-MM) — seeds the client month dropdown so it never
  // derives "this month" from the browser's local clock.
  const currentMonthET = todayET().slice(0, 7);

  const [view, byMarket, reportFacts, partialCoverage, allCohorts] = await Promise.all([
    getScorecardForPeriod(MARKET, resolved).catch((err) => {
      console.error(`[scorecard] view ${MARKET} failed:`, (err as Error)?.message ?? err);
      return null;
    }),
    getByMarket(resolved).catch((err) => {
      console.error("[scorecard] byMarket failed:", (err as Error)?.message ?? err);
      return { rows: [], total: null };
    }),
    // ③ card figures (lp_report_facts) — getReportFacts never rejects; a
    // failure yields nulls and the cards render "not yet sourced".
    getReportFacts(MARKET, resolved),
    // Partial-coverage flags for the current snapshots. Never rejects — an empty
    // map just leaves the freshness chip at its existing wording.
    getPartialCoverage(),
    // ⑤ Cohort observations (lp_cohort_maturation). Never rejects; [] hides
    // panels ② and ③ rather than rendering them at $0.
    fetchCurrentCohorts(),
  ]);

  // ── Cohorts, folded to the selected market ────────────────────────────────
  //
  // §7 applies to the MODEL as much as to the reporting: sum the market's rows
  // and derive rates from the summed numerator and denominator. For REECE that
  // means every market summed per contract month — never an average of the
  // markets' rates, and never one market's row read as the company's.
  const cohortRows = MARKET === "REECE" ? allCohorts : allCohorts.filter((c) => c.market === MARKET);
  const companyCohorts = foldCohortsByMonth(cohortRows);
  // The eligibility window is measured to the period's as-of, not to `new
  // Date()`, so the figure is reproducible from the same inputs tomorrow.
  const historicalMatureNsaRateM = historicalMatureNsaRate(companyCohorts, resolved.asOf);
  const cohortAsOf = companyCohorts.reduce<string | null>(
    (max, c) => (max == null || c.observedOn > max ? c.observedOn : max),
    null,
  );
  // Gross Written for the SELECTED period's contract month — the multiplicand
  // of the forecast. Only the current month; a prior-month dollar must never
  // enter a current-month figure.
  const currentCohort = companyCohorts.find((c) => c.contractMonth === resolved.periodStart);
  const currentCohortGrossCents = currentCohort?.grossCents ?? null;
  // THE HEADLINE ACTUAL — Gross Written − Cancellations − Financing Denied, for
  // the selected period's own contract month. Null (not 0) when the cohort view
  // is unreachable, which makes the hero render "Unavailable" with the last
  // known as-of. There is no substitute figure: RTP is a different economic
  // event and is not a fallback for this tile.
  const currentCohortNetSalesCents = currentCohort ? netSalesCents(currentCohort) : null;
  // Admin-only editor data — never let its fan-out take down the page; the panel
  // simply hides if it can't load.
  const goalsEditor = isAdmin
    ? await getScorecardGoalsForEditor().catch((err) => {
        console.error("[scorecard] goals editor failed:", (err as Error)?.message ?? err);
        return null;
      })
    : null;

  // The snapshot may legitimately trail the resolved as-of by a day (job timing);
  // anything older gets an amber "data through" chip so staleness is visible.
  const dataThrough = view?.actuals.as_of_date ?? null;
  const isStale = !!(dataThrough && dataThrough < resolved.asOf);
  // Revenue reaches its OWN date, which is not the row's. On 2026-08-10 the row
  // said 2026-08-07 while revenue said 2026-08-06 — and the column had never
  // been read, so a four-day-old revenue figure rendered indistinguishable from
  // a current one.
  const revenueThrough = view?.actuals.revenue_as_of ?? null;
  const revenueStale = !!(revenueThrough && revenueThrough < resolved.asOf);
  // How far behind, in SELLING days, measured against the last completed selling
  // day rather than the end of the selected range — on the 10th, a range that
  // ends on the 31st is not evidence anything is stale. "3 selling days behind"
  // is a number someone can act on; "data through 08/07" alone is not.
  const lastSellingDay = lastCompletedSellingDay(todayET(), SELLING_CAL);
  const dataLagDays = stalenessSellingDays(dataThrough, lastSellingDay, SELLING_CAL);
  const revenueLagDays = stalenessSellingDays(revenueThrough, lastSellingDay, SELLING_CAL);
  // Calendar age alongside selling-day lag. "3 selling days behind" is correct
  // for pacing and reads as understating it — Aug 6 → Aug 11 is 3 selling days
  // and 5 calendar days. Both go on the banner; see stalenessPhraseFull.
  const dataCalendarDays = stalenessCalendarDays(dataThrough, todayET());
  const revenueCalendarDays = stalenessCalendarDays(revenueThrough, todayET());

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <MarketPicker />
      <PeriodPicker currentMonth={currentMonthET} />
      {view && (
        <span
          className={`inline-flex h-8 items-center rounded-md px-2.5 font-mono text-[11px] font-medium tabular sm:h-7 ${
            isStale
              ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
          title={
            isStale
              ? `Snapshot trails the selected range — data through ${usDate(dataThrough!)}, range ends ${usDate(resolved.asOf)}.`
              : "Data current through this date."
          }
        >
          {isStale ? "data through" : "as of"} {usDate(view.actuals.as_of_date)}
        </span>
      )}
      {view && (() => {
        // "live · provisional" described a table that had not moved since
        // 2026-08-07, and never defined "provisional" anywhere a reader could
        // reach. The chip now leads with the date and carries the definition.
        // Released revenue is the headline figure and comes from report 134, so
        // that snapshot's coverage is the one the chip has to speak for. Under
        // [DAYOFFSET(-1)] this never fires — it exists so a scheduling
        // regression shows up as a label rather than as a quiet dip.
        const cover = partialCoverage.get(`jobs_by_milestone|${resolved.periodStart}`);
        const chip = freshnessChip({
          asOfDate: view.actuals.as_of_date,
          computedFrom: view.actuals.computed_from,
          isPartial: cover?.isPartial ?? null,
          partialThrough: cover?.periodEnd ?? null,
        });
        const tone =
          chip.tone === "emerald"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
        return (
          <span className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-medium sm:h-7 ${tone}`} title={chip.title}>
            {chip.text}
          </span>
        );
      })()}
      {isAdmin && goalsEditor && (
        <EditGoalsPanel data={goalsEditor} initialMarket={MARKET} />
      )}
      <Link
        href="/scorecard/sources"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
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

      <div className="space-y-4 p-4 sm:p-6">
        <SectionHeader
          title="Scorecard"
          subtitle="Goal & variance vs plan — one screen."
          action={controls}
        />

        {!view ? (
          <Card>
            <CardContent>
              {resolved.asOf < resolved.periodStart ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No completed selling days yet in {resolved.label} — pace and
                  to-date figures start after the first completed day.
                </p>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  No scorecard data for {resolved.label} yet.{" "}
                  {resolved.source === "snapshot"
                    ? "The daily job writes a snapshot each morning — if this persists, the LP-MCP job may be stalled; trigger a backfill via "
                    : "No stored monthly snapshots fall in this range yet. Backfill via "}
                  <code className="break-words rounded bg-slate-100 px-1 dark:bg-slate-800">
                    POST /n8n/admin/goal-scorecard-run
                  </code>{" "}
                  on the LP-MCP service. Older months are unaffected — pick one
                  from the Month menu.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          (() => {
            const vm = buildScorecardVM(view, resolved, reportFacts, SELLING_CAL);
            return (
              <>
                {/*
                  A stale number presented as current is worse than a gap. The
                  as-of chip in the controls row is easy to miss and says
                  nothing about revenue specifically; this states the age of the
                  figures next to the figures themselves.

                  Only the metrics with no report equivalent still come from the
                  live sync table — revenue itself now reads report 134 (see
                  RevenueCard) — so this banner is about the remainder.
                */}
                {(isStale || revenueStale) && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    {/*
                      ⚠️ SAY WHAT IS STALE, NOT "THE PAGE IS STALE".

                      This banner predates the Net Sales headline. It existed to
                      caveat the OLD RTP tile, which read `revenue_as_of` — and
                      when RTP was retired from the hero on 2026-08-12 the
                      banner stayed, so the page went on announcing that
                      "figures are behind" while the headline it sits above was
                      current. On 2026-08-11 that meant a banner citing 08-06
                      above a Net Sales figure that reached 08-10.

                      The headline now comes from the report-137 cohort
                      observation and carries its own as-of. `revenue_as_of`
                      governs the Released panel and nothing else, so the banner
                      names that panel instead of the page.
                    */}
                    <strong className="font-semibold">
                      {isStale
                        ? "Live-sync counts are behind."
                        : "Released figures are behind."}
                    </strong>{" "}
                    {isStale && dataThrough
                      ? `Counts and rates from the LP sync reach ${usDate(dataThrough)}${
                          stalenessPhraseFull(dataLagDays, dataCalendarDays)
                            ? ` — ${stalenessPhraseFull(dataLagDays, dataCalendarDays)}`
                            : ""
                        }`
                      : "Counts and rates from the LP sync are current"}
                    {revenueStale && revenueThrough
                      ? `. The Net Report's revenue columns reach ${usDate(revenueThrough)}${
                          stalenessPhraseFull(revenueLagDays, revenueCalendarDays)
                            ? ` (${stalenessPhraseFull(revenueLagDays, revenueCalendarDays)})`
                            : ""
                        }, which affects the Released panel only`
                      : ""}
                    {`. The selected range ends ${usDate(resolved.asOf)}.`}{" "}
                    <strong className="font-semibold">
                      Net Sales, the goal and the pace are unaffected
                    </strong>
                    {cohortAsOf ? ` — they read the sales report through ${usDate(cohortAsOf)}` : ""}
                    . Sold, Open backlog and Leads carry their own as-of dates too.
                  </div>
                )}

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

                {/* ① Goal & Pace — SALES PRODUCTION, measured, on a Net Sales basis. */}
                <PaceHero
                  vm={vm}
                  netSalesDollars={
                    currentCohortNetSalesCents == null
                      ? null
                      : Math.round(currentCohortNetSalesCents / 100)
                  }
                  netSalesAsOf={cohortAsOf}
                />

                {/*
                  ② Expected Economic Outcome — MODELED. Sits directly under the
                  measured hero and is drawn as an estimate (dashed, amber) so the
                  two are never confused. It answers "what is this month's writing
                  worth once it settles", which is a different question from "how
                  are we doing", and it is not a quality measure: it is Gross
                  Written × a historical constant.
                */}
                <ExpectedOutcomePanel
                  grossWrittenCents={currentCohortGrossCents}
                  monthlyGoalDollars={vm.pace.monthlyGoal}
                  rate={historicalMatureNsaRateM}
                  abbr={vm.abbr}
                  asOf={cohortAsOf}
                />

                {/* ③ Cohort Quality — MEASURED. Where the quality incentive lives. */}
                <CohortQualityPanel cohorts={companyCohorts} asOf={cohortAsOf} />

                {/* ④ Funnel vs Goal */}
                <FunnelGoalTable view={view} vm={vm} />

                {/*
                  ③ Daily Pace — promoted out of RevenueCard's `aside`, where it
                  was the fourth column of a revenue row. "issued/day 67.5 vs
                  110.1" is the most directly actionable line on this page for a
                  sales manager; it should not be sitting beside three dollar
                  panels competing for the same glance.
                */}
                <PerDayCard vm={vm} />

                {/* ④ Sold · Released · Open backlog — three bases, no arithmetic between them. */}
                <RevenueCard vm={vm} />

                {/* ⑤ By Market — every market for the period; rows sum to All Markets. */}
                {byMarket.rows.length > 0 && <ByMarketTable data={byMarket} abbr={vm.abbr} />}
              </>
            );
          })()
        )}
      </div>
    </>
  );
}
