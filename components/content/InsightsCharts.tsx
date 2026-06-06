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

const NAVY = "#122739";
const BRICK = "#ED1E24";

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
}: {
  byPillar: { pillar: string; engagementRate: number | null; posts: number }[];
  byArchetype: { archetype: string; engagementRate: number | null; posts: number }[];
  trend: { date: string; engagementRate: number }[];
  rejections: { reason_code: string; copy: number; image: number }[];
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={pct} />
                <Tooltip formatter={(v: number) => pct(v)} />
                <Line type="monotone" dataKey="rate" stroke={NAVY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </EmptyOr>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="copy" stackId="a" fill={NAVY} />
                <Bar dataKey="image" stackId="a" fill={BRICK} />
              </BarChart>
            </ResponsiveContainer>
          </EmptyOr>
        </CardContent>
      </Card>
    </div>
  );
}
