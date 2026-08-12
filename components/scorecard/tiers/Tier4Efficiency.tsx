import { CELL, HEAD, LABEL_CELL, SECONDARY, TierShell, Val } from "./TierShell";
import { num } from "@/lib/utils";
import type { Tier4, Tier4Row } from "@/lib/scorecard/tiers/tier4";
import { METRIC_FORMULAS } from "@/lib/scorecard/labels";

/**
 * TIER 4 — Marketing efficiency, plus Net Sales $ per issued appointment by source.
 *
 * The by-source table is the allocation tool. Net $ per issued appointment is
 * the ceiling on what a
 * lead from that source can be worth; ranking by it descending, with volume
 * beside it, is how you decide where the next dollar goes. Volume matters for
 * sizing but never for ordering — a $9,000 rate on eleven appointments is a curiosity,
 * not a budget line, and the volume column is what stops it being mistaken for
 * one.
 */
export function Tier4Efficiency({ data, showSources }: { data: Tier4; showSources: boolean }) {
  const row = (r: Tier4Row, strong = false) => (
    <tr
      key={r.market}
      className={
        strong
          ? "border-t-2 border-slate-300 bg-slate-50/70 font-semibold dark:border-slate-600 dark:bg-slate-900/40"
          : "border-t border-slate-100 dark:border-slate-800"
      }
    >
      <td className={`${LABEL_CELL} font-medium text-slate-900 dark:text-slate-100`}>{r.label}</td>
      <td className={CELL}>
        <Val m={r.costPerLead} kind="usdExact" />
      </td>
      <td className={CELL}>
        <Val m={r.costPerIssue} kind="usdExact" />
      </td>
      <td className={CELL}>
        <Val m={r.costPerSale} kind="usdExact" />
      </td>
      <td className={CELL}>
        <Val m={r.marketingPctOfNet} kind="pct" />
      </td>
      <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
        <Val m={r.nsli} kind="usd" />
      </td>
    </tr>
  );

  return (
    <TierShell
      meta={data.meta}
      action={
        <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400">
          planning Net Sales $ / issued appt <Val m={data.planningNsli} kind="usd" /> · {data.nsliWindowLabel}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${LABEL_CELL} font-semibold`}>Market</th>
              <th className={HEAD}>Cost / lead</th>
              <th className={HEAD}>Cost / issue</th>
              <th className={HEAD}>Cost / sale</th>
              <th className={HEAD}>Mktg % of net</th>
              <th className={HEAD} title={METRIC_FORMULAS.netPerIssuedAppointment}>Net $ / issued appt</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => row(r))}
            {row(data.company, true)}
          </tbody>
        </table>
      </div>

      <p className="border-t border-slate-100 px-5 py-2 text-[11.5px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Marketing at {data.company.marketingPctOfNet.known
          ? `${data.company.marketingPctOfNet.value.toFixed(1)}%`
          : "—"}{" "}
        of net revenue is efficient for home improvement (8–12% is typical). Acquisition is not the
        problem — conversion and survival are, which is Tiers 2 and 3.
      </p>

      {showSources && (
        <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <h4 className="font-display text-[12.5px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
            Net Sales $ per issued appointment, by source
            <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
              — the most payable per issued APPOINTMENT before a source stops being profitable ·{" "}
              {data.sourceWindowLabel}
            </span>
          </h4>
          {data.bySource.length === 0 ? (
            <p className="py-3 text-[12.5px] text-slate-500 dark:text-slate-400">
              No per-source rows in the window yet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className={`${LABEL_CELL} font-semibold`}>#</th>
                    <th className={`${LABEL_CELL} font-semibold`}>Source</th>
                    <th className={HEAD} title={METRIC_FORMULAS.netPerIssuedAppointment}>Net $ / issued appt</th>
                    <th className={HEAD}>Issued</th>
                    <th className={HEAD}>Net sold</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySource.map((s, i) => (
                    <tr
                      key={`${s.source}|${s.subSource}`}
                      className="border-t border-slate-100 dark:border-slate-800"
                    >
                      <td className={`${LABEL_CELL} ${SECONDARY}`}>{s.nsli.known ? i + 1 : "—"}</td>
                      <td className={LABEL_CELL}>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {s.source}
                        </span>
                        {s.subSource && s.subSource !== "(none)" && (
                          <span className={` ${SECONDARY}`}> · {s.subSource}</span>
                        )}
                      </td>
                      <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
                        <Val m={s.nsli} kind="usd" />
                      </td>
                      <td className={`${CELL} ${SECONDARY}`}>{num(s.issued)}</td>
                      <td className={`${CELL} ${SECONDARY}`}>{num(Math.round(s.netSales))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </TierShell>
  );
}
