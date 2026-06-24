"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { ScCard } from "./ScCard";
import type { MarketingRow } from "@/lib/scorecard/viewModel";

const TONE: Record<MarketingRow["tone"], string> = {
  pos: "text-emerald-600 dark:text-emerald-400",
  neg: "text-rose-600 dark:text-rose-400",
  plain: "text-slate-900 dark:text-slate-100",
};

/** The full Marketing / Sales metric table behind the visuals — collapsed by default. */
export function DetailsTable({ rows, abbr }: { rows: MarketingRow[]; abbr: string }) {
  const [open, setOpen] = useState(false);
  const dash = <span className="text-slate-300 dark:text-slate-600">—</span>;
  return (
    <ScCard
      id="sc-details"
      title={`Marketing / Sales — ${abbr} vs goal`}
      info={{
        what: "The full metric table behind the visuals above — every plan line with its full and prorated goal and the actual.",
        where: "Goals from Edit Goals; actuals from LP raw data.",
        fix: "A ⚠ marks a provisional / unreconciled figure. Red trails goal.",
      }}
      action={
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {open ? "Hide" : "Show"} all numbers
          <ChevronDown size={14} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </button>
      }
    >
      {open ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5 text-left font-semibold">Metric</th>
                <th className="px-5 py-2.5 text-right font-semibold">Monthly goal</th>
                <th className="px-5 py-2.5 text-right font-semibold">{abbr} goal</th>
                <th className="px-5 py-2.5 text-right font-semibold">{abbr} actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800/70">
                  <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      {r.metric}
                      {r.warn && <TriangleAlert size={13} className="text-amber-500" />}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular text-slate-400">{r.monthGoal ?? dash}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular text-slate-400">{r.mtdGoal ?? dash}</td>
                  <td className={`px-5 py-2.5 text-right font-mono font-semibold tabular ${TONE[r.tone]}`}>{r.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-4 text-[12.5px] text-slate-500 dark:text-slate-400">
          {rows.length} plan lines (Set, Issued, Demos, Sold, revenue buckets and more) — the source numbers behind the charts above.
        </div>
      )}
    </ScCard>
  );
}
