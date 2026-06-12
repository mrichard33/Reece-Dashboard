import {
  getInsightsTopline,
  getEngagementByPillar,
  getEngagementByArchetype,
  getEngagementTrend,
  getTopBottomPosts,
  getRejectionsByReason,
  getOpsHealth,
  getFunnelKpis,
  getPageViewsTrend,
  type RankedPost,
} from "@/lib/queries/content";
import { InsightsCharts } from "@/components/content/InsightsCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { pillarLabel, archetypeLabel } from "@/components/content/meta";
import { num, relTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-2xl font-semibold text-navy-900 dark:text-white">{value}</p>
        <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default async function InsightsPage() {
  const [topline, byPillar, byArchetype, trend, topBottom, rejections, ops, funnel, pageViews] =
    await Promise.all([
      getInsightsTopline(),
      getEngagementByPillar(),
      getEngagementByArchetype(),
      getEngagementTrend(),
      getTopBottomPosts(),
      getRejectionsByReason(),
      getOpsHealth(),
      getFunnelKpis(),
      getPageViewsTrend(),
    ]);

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Posts published" value={num(topline.postsPublished)} />
        <StatCard label="Avg engagement" value={pct(topline.avgEngagementRate)} />
        <StatCard label="Total reach" value={num(topline.totalReach)} />
        <StatCard label="Impressions" value={num(topline.totalImpressions)} />
        <StatCard label="Reactions" value={num(topline.totalReactions)} />
        <StatCard
          label="Group members"
          value={funnel.available ? num(funnel.groupMembers) : "—"}
          sub={
            funnel.available && funnel.newLast30 > 0 ? `+${num(funnel.newLast30)} in 30d` : undefined
          }
        />
      </div>

      <InsightsCharts
        byPillar={byPillar}
        byArchetype={byArchetype}
        trend={trend}
        rejections={rejections}
        growth={funnel.growth}
        pageViews={pageViews}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankTable title="Top posts" rows={topBottom.top} />
        <RankTable title="Lowest engagement" rows={topBottom.bottom} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ops health</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
            <Stat label="Approved ahead" value={num(ops.draftsAhead)} />
            <Stat label="Pending approval" value={num(ops.pendingApproval)} />
            <Stat label="Needs manual" value={num(ops.needsManual)} />
            <Stat label="Last generated" value={ops.lastGeneratedAt ? relTime(ops.lastGeneratedAt) : "—"} />
            <Stat label="Last posted" value={ops.lastPostedAt ? relTime(ops.lastPostedAt) : "—"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funnel snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <Stat label="Group opt-ins" value={funnel.available ? num(funnel.groupMembers) : "—"} />
            <Stat label="New (30d)" value={funnel.available ? num(funnel.newLast30) : "—"} />
            <Stat label="Landing views" value="not tracked" />
            <Stat label="Opt-in rate" value="not tracked" />
          </dl>
          <p className="mt-3 text-xs text-slate-400">
            Opt-ins come from the GHL <code className="font-mono">{funnel.optInTag}</code> tag
            (Mark&apos;s §11 funnel). Landing-page views aren&apos;t synced, so opt-in rate isn&apos;t
            computed yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-navy-900 dark:text-white">{value}</dd>
    </div>
  );
}

function RankTable({ title, rows }: { title: string; rows: RankedPost[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No published posts with metrics yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                <th className="py-2 pr-2">Date</th>
                <th className="px-2">Pillar</th>
                <th className="px-2">Archetype</th>
                <th className="px-2 text-right">Eng.</th>
                <th className="px-2 text-right">Reach</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-2">{r.scheduled_date}</td>
                  <td className="px-2">{pillarLabel(r.pillar)}</td>
                  <td className="px-2">{archetypeLabel(r.archetype)}</td>
                  <td className="px-2 text-right">{(r.engagementRate * 100).toFixed(1)}%</td>
                  <td className="px-2 text-right">{num(r.reach)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
