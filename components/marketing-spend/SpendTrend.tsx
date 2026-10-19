"use client";

import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { usd } from "@/lib/utils";
import { marketLabel, SCORECARD_MARKETS } from "@/lib/scorecard/markets";
import { CATEGORY_LABEL, CATEGORY_ORDER, trendMarketSeries, type MarketTrendPoint, type SpendTrendPoint } from "@/lib/queries/marketingSpend.core";
import { CATEGORY_COLOR, MARKET_TREND_COLOR } from "./colors";

type Series = { key: string; label: string; color: string };

/**
 * 12-month marketing spend, stacked. Two views (2026-10-19, the user: the chart
 * "doesn't display all colors for every market"):
 *   By office  one fixed color per office (--chart-cat-1..6 in office order),
 *              then Other markets, Held and Disputed. The company default.
 *   By type    lead sources / software / call center / … (CATEGORY_COLOR).
 * One axis; the legend names every series and the Spend table above is the
 * table view. A series with no money in the 12 months is left out.
 */
export function SpendTrend({ byCategory, byMarket }: { byCategory: SpendTrendPoint[]; byMarket: MarketTrendPoint[] }) {
  const canByOffice = byMarket.length > 0;
  const [view, setView] = useState<"office" | "type">(canByOffice ? "office" : "type");
  const mode = canByOffice ? view : "type";
  const data: Record<string, number | string>[] = mode === "office" ? byMarket : byCategory;
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No spend history yet.</p>;
  }
  const all: Series[] = mode === "office"
    ? trendMarketSeries(SCORECARD_MARKETS.map((m) => m.code), marketLabel).map((s) => ({ ...s, color: MARKET_TREND_COLOR[s.key] ?? "var(--chart-tick)" }))
    : CATEGORY_ORDER.map((c) => ({ key: c, label: CATEGORY_LABEL[c], color: CATEGORY_COLOR[c] }));
  const series = all.filter((s) => data.some((p) => Number(p[s.key]) > 0));

  return (
    <div className="space-y-2">
      {canByOffice && (
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950" role="group" aria-label="Split the chart by">
          {(["office", "type"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={mode === v}
              className={`h-8 rounded px-3 text-[12px] font-medium sm:h-7 ${mode === v ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"}`}
            >
              {v === "office" ? "By office" : "By type"}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
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
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value: string) => <span style={{ color: "var(--foreground)" }}>{value}</span>} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="spend"
              fill={s.color}
              stroke="var(--card)"
              strokeWidth={1}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
