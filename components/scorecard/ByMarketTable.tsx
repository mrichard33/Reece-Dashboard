"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
import type { ByMarketRow, ByMarketView } from "@/lib/queries/byMarket";

/**
 * Section ⑤ — By Market. Each market's funnel + revenue for the selected period,
 * with a share-of-net bar, plus the All-Markets total. Rows sum to the total.
 * Clicking a row scopes the whole scorecard to that market (`?market=`). Rows sum
 * to the All-Markets total; utility rows (Unassigned / Out of Area) show only with
 * activity. "% to Goal" is net vs the market's prorated goal.
 */
export function ByMarketTable({ data }: { data: ByMarketView }) {
  const router = useRouter();
  const params = useSearchParams();
  const { rows, total } = data;

  function open(code: string) {
    const next = new URLSearchParams(params.toString());
    if (code === "REECE") next.delete("market");
    else next.set("market", code);
    router.replace(`?${next.toString()}`);
  }

  const cell = "px-3 py-2 text-right font-mono tabular";
  const headCell = "px-3 py-2.5 text-right font-semibold";

  const Row = ({ r, strong }: { r: ByMarketRow; strong?: boolean }) => (
    <tr
      onClick={() => open(r.market)}
      className={`cursor-pointer border-t border-slate-50 transition hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50 ${
        strong ? "border-t-2 border-t-slate-200 font-semibold dark:border-t-slate-700" : ""
      }`}
    >
      <td className={`px-3 py-2 text-left ${strong ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-200"} ${r.utility ? "text-slate-400 dark:text-slate-500" : ""}`}>
        {r.label}
      </td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{num(r.leads)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{num(r.issued)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{num(r.demos)}</td>
      <td className={`${cell} text-slate-900 dark:text-slate-100`}>{num(r.sales)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{r.utility ? "—" : pct(r.close_pct)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{usd(r.gross_sales)}</td>
      <td className={`${cell} text-slate-900 dark:text-slate-100`}>{usd(r.net_sales)}</td>
      <td className={`${cell} text-slate-500 dark:text-slate-400`}>{r.goal == null ? "—" : usd(r.goal)}</td>
      <td className="px-3 py-2">
        {r.pctToGoal == null ? (
          <span className="block text-right text-slate-400">—</span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full ${r.pctToGoal >= 100 ? "bg-emerald-500" : r.pctToGoal >= 90 ? "bg-amber-500" : "bg-brick"}`}
                style={{ width: `${Math.min(100, r.pctToGoal)}%` }}
              />
            </div>
            <span className="w-11 text-right font-mono text-[12px] tabular text-slate-500">{Math.round(r.pctToGoal)}%</span>
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <ScSection id="sc-bymarket" label="By Market" meta="Click a row to open that market's scorecard">
      <div className="overflow-x-auto border-t border-slate-100 px-2 py-1 dark:border-slate-800/70 sm:px-4 sm:py-2">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2.5 text-left font-semibold">Market</th>
              <th className={headCell}>Leads</th>
              <th className={headCell}>Issued</th>
              <th className={headCell}>Demos</th>
              <th className={headCell}>Sales</th>
              <th className={headCell}>Close %</th>
              <th className={headCell}>Gross $</th>
              <th className={headCell}>Net $</th>
              <th className={headCell}>Goal</th>
              <th className={headCell}>% to Goal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <Row key={r.market} r={r} />)}
            {total && <Row r={total} strong />}
          </tbody>
        </table>
      </div>
    </ScSection>
  );
}
