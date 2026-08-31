import { requireUser } from "@/components/shell/RoleGate";
import { num } from "@/lib/utils";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getPageMetrics, type DailyPoint } from "@/lib/queries/guideMetrics";
import { getCalculatorMetrics } from "@/lib/queries/calculatorMetrics";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-sky-600 dark:bg-sky-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-xs font-medium text-slate-700 dark:text-slate-300">
        {num(value)}
      </span>
    </div>
  );
}

function DailyBars({ daily, emptyText }: { daily: DailyPoint[]; emptyText: string }) {
  const total = daily.reduce((acc, d) => acc + d.views, 0);
  const maxDaily = Math.max(1, ...daily.map((d) => d.views));
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  }
  return (
    <>
      <div className="flex h-40 items-end gap-[2px]">
        {daily.map((d) => (
          <div
            key={d.day}
            className="group relative flex-1"
            title={`${d.day}: ${d.views} views · ${d.ctaClicks} CTA clicks`}
          >
            <div
              className="w-full rounded-t bg-sky-600/80 dark:bg-sky-500/80"
              style={{ height: `${Math.max(2, (d.views / maxDaily) * 100)}%` }}
            />
            {d.ctaClicks > 0 ? (
              <div
                className="absolute bottom-0 w-full rounded-t bg-rose-600"
                style={{ height: `${Math.max(2, (d.ctaClicks / maxDaily) * 100)}%` }}
              />
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Blue = page views · Red = CTA clicks · Hover a bar for the date.
      </p>
    </>
  );
}

export default async function PageMetricsPage() {
  const user = await requireUser();
  // Independent queries against two different HL tables — run in parallel so a
  // slow one doesn't serialise the page.
  const [m, calc] = await Promise.all([getPageMetrics(30), getCalculatorMetrics(30)]);
  const g = m.guide;
  const wp = m.wp;

  const maxGuideScroll = Math.max(1, g.uniqueSessions);
  const maxWpFunnel = Math.max(1, wp.filmSessions);
  const maxCalcFunnel = Math.max(1, calc.funnel.pageViews);

  // Sources with no page views tell us nothing; hide them rather than pad the
  // table with zero rows.
  const calcSources = calc.bySource.filter((s) => s.views > 0).slice(0, 8);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Page Metrics"
        subtitle="Estimate calculator, Guide & Weakest Point journey"
      />

      <div className="space-y-6 p-6">
        {m.error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            HL Supabase query failed: {m.error}. Confirm HL_SUPABASE_URL and
            HL_SUPABASE_ANON_KEY (or HL_SUPABASE_SERVICE_KEY) are set on this
            service and that wp_page_events exists (HL migration 010).
          </div>
        ) : null}

        {calc.error ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Calculator metrics unavailable: {calc.error}. Confirm the
            estimator_events table exists in HL Supabase.
          </div>
        ) : null}

        {/* ============ ESTIMATE CALCULATOR ============ */}
        <section>
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Estimate calculator · reecewindows.com/window-estimate · last {calc.windowDays} days
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Stat label="Page views" value={num(calc.funnel.pageViews)} sub="Unique sessions" />
            <Stat
              label="Started"
              value={num(calc.funnel.step1)}
              sub="Gave contact details"
            />
            <Stat
              label="Estimates completed"
              value={num(calc.funnel.estimates)}
              sub={`${num(calc.funnel.verifyClicks)} clicked for exact pricing`}
            />
            <Stat
              label="View → estimate"
              value={pct(calc.completionRate)}
              sub={`${pct(calc.step1ToEstimate)} of those who started`}
            />
            <Stat
              label="Avg estimate"
              value={money(calc.avgEstimateTotal)}
              sub="Completed estimates only"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Calculator — step drop-off</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <BarRow label="Page view" value={calc.funnel.pageViews} max={maxCalcFunnel} />
                <BarRow label="Step 1 done" value={calc.funnel.step1} max={maxCalcFunnel} />
                <BarRow label="Added window" value={calc.funnel.windowAdded} max={maxCalcFunnel} />
                <BarRow label="Step 3 done" value={calc.funnel.step3} max={maxCalcFunnel} />
                <BarRow label="Saw estimate" value={calc.funnel.estimates} max={maxCalcFunnel} />
                <BarRow label="Wants exact" value={calc.funnel.verifyClicks} max={maxCalcFunnel} />
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Unique sessions reaching each step. The steepest drop is the step
                to fix first — everyone past &ldquo;Step 1 done&rdquo; is already
                a lead in GoHighLevel.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Calculator — daily views &amp; exact-price clicks</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyBars
                daily={calc.daily}
                emptyText="No calculator traffic recorded yet. Data appears once the calculator is live on reecewindows.com/window-estimate and sending events."
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calculator — which sources complete estimates</CardTitle>
          </CardHeader>
          <CardContent>
            {calcSources.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No source data yet. Sources appear once the calculator starts
                recording page views.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                      <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Source
                      </th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Views
                      </th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Started
                      </th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Estimates
                      </th>
                      <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Wants exact
                      </th>
                      <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Completion
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {calcSources.map((s) => (
                      <tr
                        key={s.source}
                        className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                      >
                        <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">
                          {s.source}
                        </td>
                        <td className="py-2 pr-4 text-right tabular text-slate-700 dark:text-slate-300">
                          {num(s.views)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular text-slate-700 dark:text-slate-300">
                          {num(s.step1)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular text-slate-700 dark:text-slate-300">
                          {num(s.estimates)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular text-slate-700 dark:text-slate-300">
                          {num(s.verifyClicks)}
                        </td>
                        <td className="py-2 text-right tabular font-medium text-slate-900 dark:text-white">
                          {pct(s.completionRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Completion = estimates ÷ views. A source sending traffic that
                  never completes is a targeting problem, not a page problem.
                  &ldquo;(none)&rdquo; means the visit carried no UTM parameters.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============ DHP GUIDE ============ */}
        <section className="pt-2">
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Documented Home Protection Guide · /guide · last {m.windowDays} days
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Stat label="Page views" value={num(g.totalViews)} />
            <Stat label="Unique sessions" value={num(g.uniqueSessions)} />
            <Stat
              label="Identified contacts"
              value={num(g.identifiedContacts)}
              sub="Resolved via t/cid token"
            />
            <Stat
              label="CTA clicks"
              value={num(g.ctaClicks)}
              sub={`${num(g.ctaSessions)} sessions`}
            />
            <Stat
              label="Session CTR"
              value={pct(g.sessionCtr)}
              sub="CTA sessions / view sessions"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Guide — daily views &amp; CTA clicks</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyBars
                daily={g.daily}
                emptyText="No guide traffic recorded yet. Data appears as soon as /guide receives its first page_view."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guide — scroll depth funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <BarRow label="Opened" value={g.uniqueSessions} max={maxGuideScroll} />
                <BarRow label="25%" value={g.scrollReach.pct25} max={maxGuideScroll} />
                <BarRow label="50%" value={g.scrollReach.pct50} max={maxGuideScroll} />
                <BarRow label="75%" value={g.scrollReach.pct75} max={maxGuideScroll} />
                <BarRow label="100%" value={g.scrollReach.pct100} max={maxGuideScroll} />
                <BarRow label="CTA click" value={g.ctaSessions} max={maxGuideScroll} />
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Unique sessions reaching each milestone. The drop from
                &ldquo;Opened&rdquo; to &ldquo;CTA click&rdquo; is the guide&rsquo;s
                on-page funnel.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ============ WEAKEST POINT JOURNEY ============ */}
        <section className="pt-2">
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Weakest Point journey · / → /find → /unlock → /report · last {m.windowDays} days
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Stat label="Film sessions" value={num(wp.filmSessions)} />
            <Stat
              label="Gate completes"
              value={num(wp.gateCompletes)}
              sub={`${num(wp.gateStarts)} started`}
            />
            <Stat label="Film CTA clicks" value={num(wp.ctaClicks)} />
            <Stat label="Reports generated" value={num(wp.reportsReady)} />
            <Stat
              label="Film → report rate"
              value={pct(wp.filmSessions > 0 ? wp.reportsReady / wp.filmSessions : 0)}
              sub="Reports / film sessions"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Journey funnel (unique sessions)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <BarRow label="Film (/)" value={wp.filmSessions} max={maxWpFunnel} />
                <BarRow label="Gate start" value={wp.gateStarts} max={maxWpFunnel} />
                <BarRow label="Gate done" value={wp.gateCompletes} max={maxWpFunnel} />
                <BarRow label="CTA click" value={wp.ctaClicks} max={maxWpFunnel} />
                <BarRow label="/find" value={wp.findSessions} max={maxWpFunnel} />
                <BarRow label="/unlock" value={wp.unlockSessions} max={maxWpFunnel} />
                <BarRow label="/report" value={wp.reportSessions} max={maxWpFunnel} />
                <BarRow label="Report ready" value={wp.reportsReady} max={maxWpFunnel} />
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Each row counts unique sessions reaching that step. Steepest
                drop = the step to fix first.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Journey — daily film views &amp; CTA clicks</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyBars
                daily={wp.daily}
                emptyText="No Weakest Point traffic in this window."
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
