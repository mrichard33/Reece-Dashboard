import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getGuideMetrics } from "@/lib/queries/guideMetrics";

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
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
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
        {value.toLocaleString()}
        {suffix ?? ""}
      </span>
    </div>
  );
}

export default async function GuideMetricsPage() {
  const user = await requireUser();
  const m = await getGuideMetrics(30);

  const maxDaily = Math.max(1, ...m.daily.map((d) => d.views));
  const maxScroll = Math.max(1, m.uniqueSessions);

  return (
    <>
      <TopBar
        email={user.email}
        role={user.role}
        title="Guide Metrics"
        subtitle="Documented Home Protection Guide — report.getreecewindows.com/guide"
      />

      <div className="space-y-6 p-6">
        {m.error ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            HL Supabase query failed: {m.error}. Confirm HL_SUPABASE_URL and
            HL_SUPABASE_SERVICE_KEY are set on this service and that
            wp_page_events exists (HL migration 010).
          </div>
        ) : null}

        {/* Headline stats */}
        <section>
          <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Last {m.windowDays} days
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <Stat label="Page views" value={m.totalViews.toLocaleString()} />
            <Stat label="Unique sessions" value={m.uniqueSessions.toLocaleString()} />
            <Stat
              label="Identified contacts"
              value={m.identifiedContacts.toLocaleString()}
              sub="Resolved via t/cid token"
            />
            <Stat
              label="CTA clicks"
              value={m.ctaClicks.toLocaleString()}
              sub={`${m.ctaSessions.toLocaleString()} sessions`}
            />
            <Stat
              label="Session CTR"
              value={pct(m.sessionCtr)}
              sub="CTA sessions / view sessions"
            />
          </div>
        </section>

        {/* Daily views */}
        <Card>
          <CardHeader>
            <CardTitle>Daily views &amp; CTA clicks</CardTitle>
          </CardHeader>
          <CardContent>
            {m.totalViews === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No guide traffic recorded yet. Data appears as soon as
                /guide receives its first page_view.
              </p>
            ) : (
              <div className="flex h-40 items-end gap-[2px]">
                {m.daily.map((d) => (
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
            )}
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Blue = page views · Red = CTA clicks · Hover a bar for the date.
            </p>
          </CardContent>
        </Card>

        {/* Scroll depth funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Scroll depth (sessions reaching milestone)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <BarRow label="Opened" value={m.uniqueSessions} max={maxScroll} />
              <BarRow label="25%" value={m.scrollReach.pct25} max={maxScroll} />
              <BarRow label="50%" value={m.scrollReach.pct50} max={maxScroll} />
              <BarRow label="75%" value={m.scrollReach.pct75} max={maxScroll} />
              <BarRow label="100%" value={m.scrollReach.pct100} max={maxScroll} />
              <BarRow label="CTA click" value={m.ctaSessions} max={maxScroll} />
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Each row counts unique sessions in the window. The drop from
              &ldquo;Opened&rdquo; to &ldquo;CTA click&rdquo; is the guide&rsquo;s
              on-page funnel.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
