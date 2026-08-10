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
import { EditGoalsPanel } from "@/components/scorecard/EditGoalsPanel";
import { getScorecardForPeriod, getScorecardGoalsForEditor } from "@/lib/queries/scorecard";
import { getByMarket } from "@/lib/queries/byMarket";
import { getReportFacts } from "@/lib/queries/reportFacts";
import { resolvePeriod } from "@/lib/date/resolvePeriod";
import { resolveSellingCalendar, todayET } from "@/lib/date/sellingDays";
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

  const [view, byMarket, reportFacts] = await Promise.all([
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
  ]);
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
        const cf = view.actuals.computed_from;
        const b =
          cf === "net_report_rtp"
            ? { t: "Net Report actual", c: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", title: "Closed month, report-sourced — ties to the official Net Report (Released-to-Production) to the penny." }
            : cf === "mixed"
              ? { t: "report + live (provisional)", c: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", title: "Aggregate spans closed months (report-sourced, exact) and the live current month (provisional estimate)." }
              : { t: "live · provisional", c: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", title: "Estimate for the in-progress month — a live figure, NOT the final RTP number. It reconciles to the official Net Report when the month closes." };
        return (
          <span className={`inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-medium sm:h-7 ${b.c}`} title={b.title}>
            {b.t}
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
            const vm = buildScorecardVM(view, resolved, reportFacts);
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
                    <strong className="font-semibold">
                      Live-sync figures are behind.
                    </strong>{" "}
                    {isStale && dataThrough
                      ? `Counts and rates from the LP sync reach ${usDate(dataThrough)}`
                      : "Counts and rates from the LP sync are current"}
                    {revenueStale && revenueThrough
                      ? `, and its revenue columns only reach ${usDate(revenueThrough)}`
                      : ""}
                    {` — the selected range ends ${usDate(resolved.asOf)}.`}{" "}
                    Report-sourced panels (Sold, Released, Open backlog, Leads) carry
                    their own as-of dates and are unaffected.
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

                {/* ① Goal & Pace */}
                <PaceHero vm={vm} />

                {/* ② Funnel vs Goal */}
                <FunnelGoalTable view={view} vm={vm} />

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
