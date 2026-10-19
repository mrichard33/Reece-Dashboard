"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { usd } from "@/lib/utils";
import { CATEGORY_LABEL, CATEGORY_ORDER, type SpendTrendPoint } from "@/lib/queries/marketingSpend.core";
import { CATEGORY_COLOR } from "./colors";

/**
 * 12-month marketing spend, stacked by category in CATEGORY_ORDER (one fixed
 * color each, app/globals.css --chart-cat-*). One axis; the legend names every
 * series and the Spend table above is the table view. A category with no money
 * in the 12 months is left out of the stack and the legend.
 */
export function SpendTrend({ data }: { data: SpendTrendPoint[] }) {
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No spend history yet.</p>;
  }
  const cats = CATEGORY_ORDER.filter((c) => data.some((p) => p[c] > 0));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickFormatter={(v: number) => usd(v)} width={72} />
        <Tooltip
          formatter={(v: number, name: string) => [usd(v), name]}
          cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--card-foreground)" }}
          labelStyle={{ color: "var(--card-foreground)" }}
          itemStyle={{ color: "var(--card-foreground)" }}
        />
        <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 12 }} />
        {cats.map((c, i) => (
          <Bar
            key={c}
            dataKey={c}
            name={CATEGORY_LABEL[c]}
            stackId="spend"
            fill={CATEGORY_COLOR[c]}
            stroke="var(--card)"
            strokeWidth={1}
            radius={i === cats.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
