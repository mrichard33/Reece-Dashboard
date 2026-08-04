"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { usd, shortDate } from "@/lib/utils";

// Theme-aware chart colors — CSS variables from globals.css flip with `.dark`.
const NAVY = "var(--chart-primary)"; // spend
const GREEN = "var(--chart-positive)"; // revenue

/**
 * Spend-vs-revenue daily trend for the Paid Media (Lead Gurus) section. Client
 * component — recharts needs the browser. Data comes from `ft_daily_summary`.
 */
export function SpendRevenueTrend({
  data,
}: {
  data: { date: string; spend: number; revenue: number }[];
}) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No trend data yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: shortDate(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickFormatter={(v: number) => usd(v)} width={72} />
        <Tooltip
          formatter={(v: number) => usd(v)}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--card-foreground)",
          }}
          labelStyle={{ color: "var(--card-foreground)" }}
          itemStyle={{ color: "var(--card-foreground)" }}
        />
        <Legend wrapperStyle={{ color: "var(--foreground)" }} />
        <Line type="monotone" dataKey="spend" name="Spend" stroke={NAVY} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke={GREEN} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
