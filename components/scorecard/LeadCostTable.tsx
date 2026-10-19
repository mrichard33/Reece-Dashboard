"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import { na, type CostRow, type CostView } from "@/lib/queries/marketingCost.core";
import { METRIC_LABELS } from "@/lib/scorecard/labels";

/**
 * Lead Cost — Brad's columns, from the marketing cost ledger (LP-MCP sql/158).
 *
 * One row per LP sub-source for the selected market and window: Raw / Set /
 * Issue / % Issue / # Demo / % Demo / # Sold / STD % / Gross $ / Working $ /
 * Net Sales $ / Net per Issued Appointment / Invoice Cost / Calculated Cost /
 * Total Cost / Cost ÷ Issued leads / Mkt %. † = provisional (Lead Gurus feed,
 * no invoice yet). No Calculated Cost column since 2026-10-19: commissions are
 * not lead cost any more, so it was always $0.
 *
 * 2026-10-19: lead sources only. Software, call center, commissions and held
 * company-level money are in the page's "Other marketing costs" line and on
 * /marketing-spend, where held spend and its recommendation now live (the
 * user: the scorecard is for sales).
 */

type SortKey = "total_cost" | "cost_per_issued" | "issued" | "net" | "raw" | "mkt_pct";

function costTone(mktPct: number | null, target: number): string {
  if (mktPct == null) return "text-slate-400";
  if (mktPct <= target) return "text-emerald-600 dark:text-emerald-400";
  if (mktPct <= target * 1.33) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
const money2 = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
const cell = "py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300";

export function LeadCostTable({
  view,
  targetPct,
  needsMigration,
  error,
}: {
  view: CostView | null;
  targetPct: number;
  needsMigration: boolean;
  error: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total_cost");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const rows = useMemo(() => view?.rows ?? [], [view]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number;
      const bv = (b[sortKey] ?? -Infinity) as number;
      return dir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setDir("desc"); }
  };
  const arrow = (k: SortKey) => (k === sortKey ? (dir === "desc" ? " ↓" : " ↑") : "");
  const sortable = (k: SortKey, label: string) => (
    <button type="button" onClick={() => onSort(k)} className="hover:text-slate-800 dark:hover:text-slate-200">{label}{arrow(k)}</button>
  );

  const renderRow = (r: CostRow, bold = false) => (
    <tr key={r.campaign} className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${bold ? "bg-slate-50 font-semibold dark:bg-slate-900/60" : ""}`}>
      <td className="sticky left-0 bg-white py-2 pr-3 text-left font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {r.campaign}{r.provisional ? <span title="Provisional: Lead Gurus feed, no invoice yet"> †</span> : null}
      </td>
      <td className={cell}>{num(r.raw)}</td>
      <td className={cell}>{num(r.set)}</td>
      <td className={cell}>{num(r.issued)}</td>
      <td className={cell}>{na(r.issue_pct, pct)}</td>
      <td className={cell}>{num(r.demos)}</td>
      <td className={cell}>{na(r.demo_pct, pct)}</td>
      <td className={cell}>{num(r.sold)}</td>
      <td className={cell}>{na(r.std_pct, pct)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{usd(r.gross)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{usd(r.working)}</td>
      <td className={cell}>{usd(r.net)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{na(r.nsli, usd)}</td>
      <td className={cell}>{money2(r.invoice_cost)}</td>
      <td className={`${cell} font-semibold`}>{money2(r.total_cost)}</td>
      <td className={`${cell} font-semibold`}>{na(r.cost_per_issued, money2)}</td>
      <td className={`${cell} ${costTone(r.mkt_pct, targetPct)}`}>{na(r.mkt_pct, pct)}</td>
    </tr>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Lead Cost</h3>
          <InfoPopover helpKey="scorecard.leadcost" />
          <span className="text-xs text-slate-400">
            Cost ÷ issued leads · target ≤ {targetPct}% of net
            {view?.as_of_snapshot ? ` · Net/Working as of ${view.as_of_snapshot}` : ""}
            {view?.grain === "week" ? " · weekly (no Net/Working at week grain)" : ""}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {needsMigration && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The marketing cost ledger is not in this database yet. Apply LP-MCP <code>sql/158_marketing_cost_ledger.sql</code> from the Supabase dashboard.
          </p>
        )}
        {error && !needsMigration && (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            Lead cost could not be read: {error}
          </p>
        )}
        {view && !view.any_cost && !needsMigration && (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            No marketing cost in the ledger for this window yet. Costs arrive from invoices approved in #marketing-invoice-review, the Lead Gurus feed and the monthly commission rules.
          </p>
        )}

        {/* Phone + tablet: stacked cards */}
        <div className="space-y-2 lg:hidden">
          {sorted.map((r) => {
            const metrics: { label: string; value: string; tone?: string }[] = [
              { label: "Issued", value: num(r.issued) },
              { label: "Cost / Issued", value: na(r.cost_per_issued, money2) },
              { label: "Total cost", value: money2(r.total_cost) },
              { label: "Net sales", value: usd(r.net) },
              { label: METRIC_LABELS.demoToSale, value: na(r.std_pct, pct) },
              { label: "Mkt %", value: na(r.mkt_pct, pct), tone: costTone(r.mkt_pct, targetPct) },
            ];
            return (
              <div key={r.campaign} className="rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium text-slate-700 dark:text-slate-200">
                    {r.campaign}{r.provisional ? " †" : ""}
                  </span>
                  <span className="shrink-0 font-mono text-[14px] font-semibold tabular text-slate-900 dark:text-slate-100">{money2(r.total_cost)}</span>
                </div>
                {/* mobile-ok: the phone card view — three short figures per row fit at 375px */}
                <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
                  {metrics.map((m) => (
                    <div key={m.label}>
                      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">{m.label}</div>
                      <div className={`mt-0.5 font-mono text-[12.5px] tabular ${m.tone ?? "text-slate-700 dark:text-slate-200"}`}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {view && rows.length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-[13px] dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100">
                <span>All campaigns</span><span className="font-mono tabular">{money2(view.totals.total_cost)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Cost ÷ issued ({num(view.totals.issued)} issued)</span><span className="font-mono tabular">{na(view.totals.cost_per_issued, money2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop: the full Brad-format table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium dark:bg-slate-900">Campaign</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("raw", "Raw")}</th>
                <th className="py-2 pl-3 text-right font-medium">Set</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("issued", "Issue")}</th>
                <th className="py-2 pl-3 text-right font-medium">{METRIC_LABELS.issue}</th>
                <th className="py-2 pl-3 text-right font-medium"># Demo</th>
                <th className="py-2 pl-3 text-right font-medium">{METRIC_LABELS.demo}</th>
                <th className="py-2 pl-3 text-right font-medium"># Sold</th>
                <th className="py-2 pl-3 text-right font-medium" title={METRIC_LABELS.demoToSale}>STD %</th>
                <th className="hidden py-2 pl-3 text-right font-medium xl:table-cell">Gross $</th>
                <th className="hidden py-2 pl-3 text-right font-medium xl:table-cell">Working $</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("net", "Net Sales $")}</th>
                <th className="hidden py-2 pl-3 text-right font-medium xl:table-cell" title={METRIC_LABELS.netPerIssuedAppointment}>Net $ / Issued</th>
                <th className="py-2 pl-3 text-right font-medium">Invoice Cost</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("total_cost", "Total Cost")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("cost_per_issued", "Cost / Issued Lead")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("mkt_pct", "Mkt %")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => renderRow(r))}
              {view && rows.length > 0 && renderRow(view.totals, true)}
            </tbody>
          </table>
        </div>

        {rows.some((r) => r.provisional) && (
          <p className="mt-2 text-[11px] text-slate-400">† provisional: Lead Gurus feed spend, replaced by the invoice at month close.</p>
        )}
      </CardContent>
    </Card>
  );
}
