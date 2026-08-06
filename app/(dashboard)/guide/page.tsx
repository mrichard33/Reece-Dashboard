import { requireUser } from "@/components/shell/RoleGate";
import { num } from "@/lib/utils";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getPageMetrics, type DailyPoint } from "@/lib/queries/guideMetrics";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
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
  const m = await getPageMetrics(30);
  const g = m.guide;
  const wp = m.wp;

  const maxGuideScroll = Math.max(1, g.uniqueSessions);
  const maxWpFunnel = Math.max(1, wp.filmSessions);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Page Metrics"
        subtitle="Guide & Weakest Point journey — report.getreecewindows.com"
      />

      <div className="space-y-6 p-6">
        {m.error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            HL Supabase query failed: {m.error}. Confirm HL_SUPABASE_URL and
            HL_SUPABASE_ANON_KEY (or HL_SUPABASE_SERVICE_KEY) are set on this
            service and that wp_page_events exists (HL migration 010).
          </div>
        ) : null}

        {/* ============ DHP GUIDE ============ */}
        <section>
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
