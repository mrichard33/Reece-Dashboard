"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { pillarLabel, archetypeLabel, REASON_LABEL } from "@/components/content/meta";
import type { FbReasonCode } from "@/lib/supabase/types";

// Theme-aware chart chrome — CSS variables defined in globals.css flip with the
// `.dark` class, so grids/ticks/series stay legible in both themes.
const NAVY = "var(--chart-primary)";
const BRICK = "var(--chart-accent)";
const GRID = "var(--chart-grid)";
const TICK = { fontSize: 11, fill: "var(--chart-tick)" };
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--card-foreground)",
  },
  labelStyle: { color: "var(--card-foreground)" },
  itemStyle: { color: "var(--card-foreground)" },
} as const;

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function EmptyOr({ has, children }: { has: boolean; children: React.ReactNode }) {
  if (!has) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No data yet — metrics appear once posts are published and pulled.
      </p>
    );
  }
  return <>{children}</>;
}

export function InsightsCharts({
  byPillar,
  byArchetype,
  trend,
  rejections,
  growth,
  pageViews,
}: {
  byPillar: { pillar: string; engagementRate: number | null; posts: number }[];
  byArchetype: { archetype: string; engagementRate: number | null; posts: number }[];
  trend: { date: string; engagementRate: number }[];
  rejections: { reason_code: string; copy: number; image: number }[];
  growth: { date: string; total: number }[];
  pageViews: { date: string; views: number }[];
}) {
  const pillarData = byPillar.map((d) => ({
    name: pillarLabel(d.pillar),
    rate: (d.engagementRate ?? 0) * 100,
  }));
  const archetypeData = byArchetype.map((d) => ({
    name: archetypeLabel(d.archetype),
    rate: (d.engagementRate ?? 0) * 100,
  }));
  const trendData = trend.map((d) => ({ name: d.date, rate: d.engagementRate * 100 }));
  const rejectionData = rejections.map((d) => ({
    name: REASON_LABEL[d.reason_code as FbReasonCode] ?? d.reason_code,
    copy: d.copy,
    image: d.image,
  }));
  const growthData = growth.map((d) => ({ name: d.date, total: d.total }));
  const pageViewsData = pageViews.map((d) => ({ name: d.date, views: d.views }));

  const hasEngagement = pillarData.some((d) => d.rate > 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Engagement by pillar</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyOr has={hasEngagement}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pillarData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={TICK} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} {...TOOLTIP_STYLE} />
                <Bar dataKey="rate" fill={NAVY} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </EmptyOr>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engagement by archetype</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyOr has={archetypeData.some((d) => d.rate > 0)}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={archetypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={TICK} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} {...TOOLTIP_STYLE} />
                <Bar dataKey="rate" fill={BRICK} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </EmptyOr>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engagement-rate trend</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyOr has={trendData.length > 0}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} />
                <YAxis tick={TICK} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} {...TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="rate" stroke={NAVY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </EmptyOr>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Page views (daily)</CardTitle>
        </CardHeader>
        <CardContent>
          {pageViewsData.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No page views yet — WF5 pulls Facebook Page views daily at 9 AM ET.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={pageViewsData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} />
                <YAxis tick={TICK} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="views" stroke={NAVY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejections by reason</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyOr has={rejectionData.length > 0}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rejectionData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={TICK} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: "var(--foreground)" }} />
                <Bar dataKey="copy" stackId="a" fill={NAVY} />
                <Bar dataKey="image" stackId="a" fill={BRICK} />
              </BarChart>
            </ResponsiveContainer>
          </EmptyOr>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Group growth (opt-ins)</CardTitle>
        </CardHeader>
        <CardContent>
          {growthData.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              No opt-ins yet — populates once the GHL group opt-in funnel tags contacts.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={TICK} />
                <YAxis tick={TICK} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="total" stroke={BRICK} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
