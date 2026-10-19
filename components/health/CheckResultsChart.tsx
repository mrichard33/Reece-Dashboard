"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import type { ResultPoint } from "@/lib/queries/systemHealth.core";
import { etShort } from "@/lib/utils";

const PRIMARY = "var(--chart-primary)";

/**
 * The last 100 results of one check, with its "turns yellow" and "turns red"
 * lines from the check's config (thresholds live in the database, not in the
 * page). Axis labels are Eastern, 12-hour ("Oct 15, 7:30 PM": etShort).
 */
export function CheckResultsChart({
  results,
  warn,
  fail,
  unit,
}: {
  results: ResultPoint[];
  warn: number | null;
  fail: number | null;
  unit: string | null;
}) {
  const data = results.filter((r) => r.value !== null).map((r) => ({ label: etShort(r.at), value: r.value, status: r.status }));
  if (!data.length) {
    return <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No numeric results to chart yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--chart-tick)" }} interval="preserveStartEnd" minTickGap={32} />
        <YAxis tick={{ fontSize: 11, fill: "var(--chart-tick)" }} width={40} />
        <Tooltip formatter={(v) => [`${v}${unit && unit !== "count" ? ` ${unit}` : ""}`, "Result"]} />
        {warn !== null && <ReferenceLine y={warn} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "yellow", fontSize: 10, fill: "#b45309", position: "insideTopRight" }} />}
        {fail !== null && <ReferenceLine y={fail} stroke="#ED1E24" strokeDasharray="4 4" label={{ value: "red", fontSize: 10, fill: "#C5141A", position: "insideTopRight" }} />}
        <Line type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
