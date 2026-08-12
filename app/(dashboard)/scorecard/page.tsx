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
import {
  buildReportingClock,
  clockChip,
  gate,
  lagBadge,
  type SourceClock,
} from "@/lib/scorecard/reportingClock";
import { fromNullable } from "@/lib/scorecard/tiers/types";
import { getScorecardForPeriod, getScorecardGoalsForEditor } from "@/lib/queries/scorecard";
import { getByMarket } from "@/lib/queries/byMarket";
import { getReportFacts, getPartialCoverage } from "@/lib/queries/reportFacts";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
// Staleness wording now lives behind reportingClock's lagBadge(), so the page
// has one source for "how far behind" instead of four inline call sites.
import { freshnessChip } from "@/lib/scorecard/freshness";
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
  // The latest OBSERVATION across cohorts — "when did we last look at any of
  // this". Correct for the maturation panels and for nothing else. It reads
  // 08-11 while the dollars stop 08-10, which is precisely why it must not date
  // a current-period figure. See `currentCohort.dataThrough` below.
  const cohortObservedOn = companyCohorts.reduce<string | null>(
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
  // ⚠️ The VALUE and its DATE must come from the SAME row. This used to take the
  // value from `currentCohort` (one contract month) and the date from a max over
  // EVERY month, so nothing guaranteed they described the same thing.
  const netSalesThrough = currentCohort?.dataThrough ?? null;
  // Admin-only editor data — never let its fan-out take down the page; the panel
  // simply hides if it can't load.
  const goalsEditor = isAdmin
    ? await getScorecardGoalsForEditor().catch((err) => {
        console.error("[scorecard] goals editor failed:", (err as Error)?.message ?? err);
        return null;
      })
    : null;

  // ── ONE reporting cutoff ───────────────────────────────────────────────────
  //
  // Every current-period source registers how far its DATA reaches, and is
  // judged against a single calendar cutoff. This replaces five independent
  // date lookups that the page used to render side by side as if they described
  // one period. See lib/scorecard/reportingClock.ts.
  const clock = buildReportingClock({
    today: todayET(),
    period: { periodStart: resolved.periodStart, periodEnd: resolved.periodEnd },
    cal: SELLING_CAL,
    sources: {
      net_sales: {
        id: "net_sales",
        label: "Net Sales · report 137",
        role: { kind: "current_period", goalBearing: true },
        // data_through, NOT observed_on. The distinction is the entire point.
        dataThrough: fromNullable(
          netSalesThrough,
          currentCohort
            ? "the report 137 snapshot for this month does not declare its coverage (partial file)"
            : "no report 137 cohort row for this month",
        ),
        stampedAt: currentCohort?.observedOn ?? null,
      },
      live_sync: {
        id: "live_sync",
        label: "Live sync · funnel counts",
        role: { kind: "current_period" },
        // Here `as_of_date` genuinely IS a coverage date — the column means
        // "how far this row reaches". Same name, opposite meaning from 137's.
        dataThrough: fromNullable(view?.actuals.as_of_date ?? null, "no live-sync row for this period"),
        stampedAt: view?.actuals.as_of_date ?? null,
      },
      released_rtp: {
        id: "released_rtp",
        label: "Released to production · report 134",
        role: {
          kind: "exempt",
          why:
            "dated by production milestone, not contract date — a contract sold in April is " +
            "released in August, so it is answering a different question rather than running late",
        },
        dataThrough: fromNullable(view?.actuals.revenue_as_of ?? null, "no Net Report has landed"),
        stampedAt: view?.actuals.revenue_as_of ?? null,
      },
    } satisfies Record<string, SourceClock>,
  });

  const netSalesGate = gate(clock.bySource.net_sales, currentCohortNetSalesCents);
  // Revenue reaches its OWN date, which is not the row's — the exempt RTP
  // clock above carries it now, and the banner below reads that clock rather
  // than re-deriving a second copy of the same comparison.
  const revenueThrough = view?.actuals.revenue_as_of ?? null;
  const revenueStale = clock.bySource.released_rtp.lagSellingDays != null
    && clock.bySource.released_rtp.lagSellingDays > 0;

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <MarketPicker />
      <PeriodPicker currentMonth={currentMonthET} />
      {/* ONE cutoff chip. There used to be two here rendering the same date —
          "as of 08-10-2026" beside "Data through 08-10-2026 · Provisional" —
          and neither was the date the headline actually covered. This names the
          ACHIEVED cutoff and carries the declared one in the tooltip. */}
      {view && (() => {
        const chip = clockChip(clock.cutoff);
        const behind = clock.cutoff.anchorLagSellingDays > 0;
        return (
          <span
            className={`inline-flex h-8 items-center rounded-md px-2.5 font-mono text-[11px] font-medium tabular sm:h-7 ${
              behind
                ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}
            title={chip.title}
          >
            {chip.text}
          </span>
        );
      })()}
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
            // The clock's elapsed is threaded in ONCE here, so the hero, the funnel
            // targets and the per-day card all prorate over the same days. Passing
            // it to the hero alone would put two disagreeing target-to-date
            // figures on one screen — $3,388,423 and $3,811,976 — which is the
            // defect this whole change exists to remove, reintroduced one level
            // down.
            const vm = buildScorecardVM(
              view,
              resolved,
              reportFacts,
              SELLING_CAL,
              clock.cutoff.paceElapsedDays,
            );
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
                {/*
                  ⚠️ SAY WHICH SOURCE, AND SAY IT FROM THE CLOCK.

                  This banner predates the Net Sales headline. It existed to
                  caveat the OLD RTP tile and stayed after RTP was retired, so
                  the page went on announcing "figures are behind" above a
                  headline that was current — and it re-derived its own staleness
                  comparisons, which is how the page ended up with five dates.

                  It now reads the reporting clock: one entry per source that is
                  actually behind the cutoff, named, with its own lag. An exempt
                  source (RTP) is never "behind" — it is on a different basis —
                  so it is described rather than accused.
                */}
                {(clock.lagging.length > 0 || clock.refused.length > 0 || revenueStale) && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
                  >
                    <strong className="font-semibold">
                      {clock.refused.length > 0
                        ? "A source runs past the reporting cutoff."
                        : clock.lagging.length > 0
                          ? "A source is behind the reporting cutoff."
                          : "Released figures are on their own date."}
                    </strong>{" "}
                    {`Every current-period figure on this page is reported through ${
                      clock.cutoff.achieved.known
                        ? usDate(clock.cutoff.achieved.value)
                        : usDate(clock.cutoff.declared)
                    }.`}
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                      {[...clock.refused, ...clock.lagging].map((id) => (
                        <li key={id}>
                          {clock.bySource[id].note}
                        </li>
                      ))}
                      {revenueStale && revenueThrough && (
                        <li>
                          {`Released to production reaches ${usDate(revenueThrough)}. It is dated by production milestone, not contract date, so it is not late — it answers a different question and affects the Released panel only.`}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {clock.problems.length > 0 && (
                  <div
                    role="status"
                    className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-200"
                  >
                    {/* A registry violation is a bug in this page, not in the
                        data. Surfaced rather than thrown so the scorecard still
                        renders. */}
                    <strong className="font-semibold">Reporting-clock misconfiguration.</strong>{" "}
                    {clock.problems.join("; ")}.
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
                  // COVERAGE, not observation. The hero is a current-period
                  // figure, so it is dated by what its file covers (08-10) and
                  // never by when LP ran the report (08-11).
                  netSalesAsOf={netSalesThrough ?? cohortObservedOn}
                  // The lag travels WITH the number. Aligning the pace anchor to
                  // the achieved cutoff makes a late feed look BETTER — Balance
                  // improves by $423,553 on 2026-08-12 — so the badge is what
                  // discharges that, and it must not be separable from the tile.
                  netSalesLag={lagBadge(clock.bySource.net_sales)}
                  netSalesRefused={netSalesGate.status === "refused" ? netSalesGate.reason : null}
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
                  asOf={cohortObservedOn}
                />

                {/* ③ Cohort Quality — MEASURED. Where the quality incentive lives. */}
                <CohortQualityPanel cohorts={companyCohorts} asOf={cohortObservedOn} />

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
