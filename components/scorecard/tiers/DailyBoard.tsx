import { CELL, HEAD, LABEL_CELL, Val } from "./TierShell";
import { marketLabel } from "@/lib/scorecard/markets";
import { usDate } from "@/lib/utils";
import type { DailyRow, DailyView } from "@/lib/scorecard/tiers/daily";

/**
 * The Daily board — volumes and nothing else.
 *
 * There is deliberately no goal column, no pace column, no projection and no
 * variance. One selling day cannot carry that math, and putting it here anyway
 * is what taught the floor to discount the page.
 */
const COLS: { key: keyof Omit<DailyRow, "market" | "label" | "isCompany">; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "sets", label: "Sets" },
  { key: "issued", label: "Issues" },
  { key: "demos", label: "Demos" },
  { key: "sales", label: "Sales" },
];

export function DailyBoard({ data }: { data: DailyView }) {
  const row = (r: DailyRow, strong = false) => (
    <tr
      key={r.market}
      className={
        strong
          ? "border-t-2 border-slate-300 bg-slate-50/70 font-semibold dark:border-slate-600 dark:bg-slate-900/40"
          : "border-t border-slate-100 dark:border-slate-800"
      }
    >
      <td className={`${LABEL_CELL} font-medium text-slate-900 dark:text-slate-100`}>
        {r.isCompany ? r.label : marketLabel(r.market)}
      </td>
      {COLS.map((c) => (
        <td key={c.key} className={CELL}>
          <Val m={r[c.key]} />
        </td>
      ))}
    </tr>
  );

  return (
    <section className="scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-100 px-5 pb-3 pt-4 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            Yesterday
          </h3>
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {data.asOf ? usDate(data.asOf) : "no data"}
          </span>
        </div>
        <p className="pt-1.5 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
          What happened, by market. No goal or pace math — a single day is too noisy to pace against.
        </p>
      </div>

      {data.rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-slate-500 dark:text-slate-400">
          {data.windowLabel}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className={`${LABEL_CELL} font-semibold`}>Market</th>
                  {COLS.map((c) => (
                    <th key={c.key} className={HEAD}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => row(r))}
                {data.company && row(data.company, true)}
              </tbody>
            </table>
          </div>
          {!data.isSingleDay && (
            <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-[11.5px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
              {data.windowLabel}
            </p>
          )}
        </>
      )}
    </section>
  );
}
