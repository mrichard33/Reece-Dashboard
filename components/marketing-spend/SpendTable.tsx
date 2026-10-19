"use client";

import { Fragment, useState } from "react";
import { ChevronRight } from "lucide-react";
import { usdExact } from "@/lib/utils";
import { marketLabel } from "@/lib/scorecard/markets";
import type { SpendCells, SpendView } from "@/lib/queries/marketingSpend.core";
import { CATEGORY_COLOR } from "./colors";

/**
 * Spend by category → vendor → sub-source, one column per market (+ Held for
 * the company) and a Total, rows sorted by total. Tap a row to open it. The
 * table scrolls sideways inside itself on a phone, with the name column pinned.
 */
const HOLD = "REECE_HOLD";
const DISPUTED = "DISPUTED";
const colLabel = (c: string) => (c === HOLD ? "Held" : c === DISPUTED ? "Disputed" : marketLabel(c));
const money = (v: number) => (v ? usdExact(v) : "—");
const cell = "py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300";

/** Canvass commission is 15% of net until canvasser payroll is uploaded (the user, 2026-10-19). */
function EstimateBadge() {
  return (
    <span
      title="15% of net until the canvasser payroll reports are uploaded"
      className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
    >
      Estimate
    </span>
  );
}

export function SpendTable({ view }: { view: SpendView }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const showTotal = view.columns.length > 1;

  const cells = (c: SpendCells, bold = false) => (
    <>
      {view.columns.map((col) => (
        <td key={col} className={`${cell} ${bold ? "font-semibold" : ""}`}>{money(c.byMarket[col] ?? 0)}</td>
      ))}
      {showTotal && <td className={`${cell} font-semibold text-slate-900 dark:text-slate-100`}>{money(c.total)}</td>}
    </>
  );

  if (!view.groups.length) {
    return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No approved marketing cost in this window yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
            <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-medium dark:bg-slate-900">Category</th>
            {view.columns.map((c) => <th key={c} className="py-2 pl-3 text-right font-medium">{colLabel(c)}</th>)}
            {showTotal && <th className="py-2 pl-3 text-right font-medium">Total</th>}
          </tr>
        </thead>
        <tbody>
          {view.groups.map((g) => {
            const gk = g.category;
            return (
              <Fragment key={gk}>
                <tr className="border-b border-slate-100 bg-slate-50/60 dark:border-slate-800/60 dark:bg-slate-900/60">
                  <td className="sticky left-0 z-10 bg-slate-50 py-1 pr-3 dark:bg-slate-900">
                    <button type="button" onClick={() => toggle(gk)} aria-expanded={!!open[gk]} className="flex min-h-8 items-center gap-1.5 text-left font-semibold text-slate-800 dark:text-slate-100">
                      <ChevronRight size={14} className={`shrink-0 text-slate-400 transition ${open[gk] ? "rotate-90" : ""}`} />
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLOR[g.category] }} />
                      {g.label}
                    </button>
                  </td>
                  {cells(g, true)}
                </tr>
                {open[gk] && g.vendors.map((v) => {
                  const vk = `${gk}|${v.vendor}`;
                  const many = v.subSources.length > 1 || (v.subSources[0] && v.subSources[0].sub_source !== v.vendor);
                  return (
                    <Fragment key={vk}>
                      <tr className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="sticky left-0 z-10 bg-white py-1 pl-6 pr-3 dark:bg-slate-900">
                          {many ? (
                            <button type="button" onClick={() => toggle(vk)} aria-expanded={!!open[vk]} className="flex min-h-8 items-center gap-1.5 text-left font-medium text-slate-700 dark:text-slate-200">
                              <ChevronRight size={13} className={`shrink-0 text-slate-400 transition ${open[vk] ? "rotate-90" : ""}`} />
                              {v.vendor}{v.estimate && <EstimateBadge />}
                            </button>
                          ) : (
                            <span className="flex min-h-8 items-center pl-5 font-medium text-slate-700 dark:text-slate-200">{v.vendor}{v.estimate && <EstimateBadge />}</span>
                          )}
                        </td>
                        {cells(v)}
                      </tr>
                      {many && open[vk] && v.subSources.map((s) => (
                        <tr key={`${vk}|${s.sub_source}`} className="border-b border-slate-100 text-[13px] dark:border-slate-800/60">
                          <td className="sticky left-0 z-10 bg-white py-1.5 pl-12 pr-3 text-slate-500 dark:bg-slate-900 dark:text-slate-400">{s.sub_source}{s.estimate && <EstimateBadge />}</td>
                          {cells(s)}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
          <tr className="bg-slate-50 font-semibold dark:bg-slate-900/60">
            <td className="sticky left-0 z-10 bg-slate-50 py-2 pr-3 text-left text-slate-800 dark:bg-slate-900 dark:text-slate-100">Total</td>
            {cells({
              total: view.tiles.total,
              byMarket: Object.fromEntries(view.columns.map((c) => [c, view.groups.reduce((s, g) => s + (g.byMarket[c] ?? 0), 0)])),
            }, true)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
