import { CELL, HEAD, LABEL_CELL, SECONDARY, TierShell, Val } from "./TierShell";
import { usDate } from "@/lib/utils";
import type { Tier5 } from "@/lib/scorecard/tiers/tier5";

/**
 * TIER 5 — Backlog. A stock, stamped with its own as-of date.
 *
 * The footing line is not decoration. If the buckets stop summing to total open
 * jobs, an LP status has appeared that this map does not classify, and those
 * jobs are silently missing from the page — so the tier says so in red rather
 * than quietly showing a smaller backlog than exists.
 */
export function Tier5Backlog({ data }: { data: Tier5 }) {
  return (
    <TierShell
      meta={data.meta}
      action={
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          as of {data.asOf ? usDate(data.asOf) : "—"}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${LABEL_CELL} font-semibold`}>Bucket</th>
              <th className={HEAD}>Jobs</th>
              <th className={HEAD}>Dollars</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr key={b.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className={LABEL_CELL}>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{b.label}</div>
                  <div className={SECONDARY}>{b.note}</div>
                </td>
                <td className={CELL}>
                  <Val m={b.count} />
                </td>
                <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
                  <Val m={b.dollars} kind="usd" />
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold dark:border-slate-700 dark:bg-slate-900/40">
              <td className={LABEL_CELL}>Pending backlog</td>
              <td className={CELL}>
                <Val m={data.pendingCount} />
              </td>
              <td className={CELL}>
                <Val m={data.pendingDollars} kind="usd" />
              </td>
            </tr>
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className={LABEL_CELL}>
                <div className="text-slate-500 dark:text-slate-400">Released / in production</div>
                <div className={SECONDARY}>Open, but no longer pending — outside the backlog.</div>
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.excludedCount} />
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.excludedDollars} kind="usd" />
              </td>
            </tr>
            <tr className="border-t-2 border-slate-300 bg-slate-50/70 font-semibold dark:border-slate-600 dark:bg-slate-900/40">
              <td className={LABEL_CELL}>Total open jobs</td>
              <td className={CELL}>
                <Val m={data.openJobsTotal} />
              </td>
              <td className={CELL} />
            </tr>
            {/* Terminal outcomes sit BELOW the total on purpose. Report 133 is a
                contract-date cohort and carries them, but a paid or cancelled
                job is not open backlog and must never be added into it. */}
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className={LABEL_CELL}>
                <div className="text-slate-500 dark:text-slate-400">Completed in cohort</div>
                <div className={SECONDARY}>Paid in full. Closed — not open backlog.</div>
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.completedCount} />
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.completedDollars} kind="usd" />
              </td>
            </tr>
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className={LABEL_CELL}>
                <div className="text-slate-500 dark:text-slate-400">Lost in cohort</div>
                <div className={SECONDARY}>Cancelled, credit decline or dead deal.</div>
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.lostCount} />
              </td>
              <td className={`${CELL} text-slate-500 dark:text-slate-400`}>
                <Val m={data.lostDollars} kind="usd" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p
        className={`border-t px-5 py-2 text-[11.5px] ${
          data.foots
            ? "border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400"
            : "border-brick/30 bg-brick/5 text-brick dark:text-rose-400"
        }`}
      >
        {data.foots
          ? "Buckets foot exactly to total open jobs."
          : "Buckets do NOT foot to total open jobs — a status exists upstream that this map does not classify."}
      </p>

      {data.permitFlag && (
        <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-[11.5px] text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
          {data.permitFlag}
        </p>
      )}
    </TierShell>
  );
}
