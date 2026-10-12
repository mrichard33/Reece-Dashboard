"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { usd } from "@/lib/utils";
import type { TrendPoint } from "@/lib/queries/marketingCost.core";

// Theme-aware chart colors — CSS variables from globals.css flip with `.dark`.
const NAVY = "var(--chart-primary)"; // total cost (bars)
const GREEN = "var(--chart-positive)"; // cost per issued lead (line)

/**
 * 12-month trend for the Lead Cost tab: total marketing cost (bars, left
 * axis) and cost per issued lead (line, right axis). Client component —
 * recharts needs the browser. Data comes from v_market_subsource_cost.
 */
export function CostTrend({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No cost history yet.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickFormatter={(v: number) => usd(v)} width={72} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickFormatter={(v: number) => usd(v)} width={64} />
        <Tooltip
          formatter={(v: number, name: string) => [v == null ? "n.a." : usd(v), name]}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--card-foreground)" }}
          labelStyle={{ color: "var(--card-foreground)" }}
          itemStyle={{ color: "var(--card-foreground)" }}
        />
        <Legend wrapperStyle={{ color: "var(--foreground)" }} />
        <Bar yAxisId="left" dataKey="total_cost" name="Total cost" fill={NAVY} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="cost_per_issued" name="Cost ÷ issued leads" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
