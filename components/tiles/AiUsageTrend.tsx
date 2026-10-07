"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { shortDate } from "@/lib/utils";
import { aiUsd, type UsageDay } from "@/lib/queries/llmUsage.core";

/**
 * Daily AI spend (or daily calls, while no model has a price) for the overview
 * AI usage section. One series, so no legend: the card title names it. Client
 * component — recharts needs the browser.
 */
export function AiUsageTrend({ data, metric }: { data: UsageDay[]; metric: "cost" | "calls" }) {
  if (!data.length) {
    return (
      <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No AI calls recorded yet.
      </p>
    );
  }

  // An unpriced day plots at zero height; the tooltip still says "not priced".
  const chartData = data.map((d) => ({
    label: shortDate(d.date),
    value: metric === "cost" ? d.cost ?? 0 : d.calls,
    cost: d.cost,
    calls: d.calls,
  }));
  type Point = (typeof chartData)[number];
  const fmt = (v: number) => (metric === "cost" ? aiUsd(v) : new Intl.NumberFormat("en-US").format(v));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--chart-tick)" }}
          interval="preserveStartEnd"
          minTickGap={24}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--chart-tick)" }} tickFormatter={fmt} width={64} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
          content={({ active, payload }) => {
            const p: Point | undefined = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold text-navy-900 dark:text-white">{p.label}</p>
                <p className="text-slate-600 dark:text-slate-300">
                  Cost: {p.cost === null ? (p.calls ? "not priced" : "—") : aiUsd(p.cost)}
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Calls: {new Intl.NumberFormat("en-US").format(p.calls)}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="value" name={metric === "cost" ? "Cost" : "Calls"} fill="var(--chart-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
