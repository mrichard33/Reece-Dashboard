"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { shortDate } from "@/lib/utils";
import { formatMinutes } from "@/lib/queries/leadLeaks.core";

// Theme-aware chart color — the CSS variable flips with `.dark`.
const PRIMARY = "var(--chart-primary)";

type Point = { label: string; median: number | null; p90: number | null };

/**
 * Working time from a lead's arrival to its first Five9 call, per ET creation
 * day — the TYPICAL lead (median). One series, one axis.
 *
 * The slow tail (90th percentile) is NOT drawn: it runs 20–40× the median
 * (live 2026-09-26: ~48m typical vs ~30h for the slowest 10%), so on a shared
 * axis it flattens the line people actually watch to the floor. It is in the
 * hover tooltip and in the table under the chart instead.
 */
export function SpeedTrend({
  data,
}: {
  data: { day: string; medianMin: number | null; p90Min: number | null }[];
}) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No time-to-first-call data yet.
      </p>
    );
  }

  const chartData: Point[] = data.map((d) => ({
    label: shortDate(d.day),
    median: d.medianMin,
    p90: d.p90Min,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--chart-tick)" }}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--chart-tick)" }}
          tickFormatter={(v: number) => formatMinutes(v)}
          width={56}
        />
        <Tooltip content={<SpeedTooltip />} />
        <Line
          type="monotone"
          dataKey="median"
          name="Typical lead (median)"
          stroke={PRIMARY}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SpeedTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div
      className="rounded-md px-3 py-2 text-xs shadow-sm"
      style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
    >
      <p className="mb-1 font-semibold">Leads that arrived {p.label}</p>
      <p>Typical lead: {formatMinutes(p.median)}</p>
      <p className="text-slate-500 dark:text-slate-400">Slowest 10%: {formatMinutes(p.p90)}</p>
    </div>
  );
}
