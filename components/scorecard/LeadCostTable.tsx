"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import { na, type CostRow, type CostView } from "@/lib/queries/marketingCost.core";
import { splitPrimaryRows } from "@/lib/queries/marketingSpend.core";
import { METRIC_LABELS } from "@/lib/scorecard/labels";

/**
 * Lead Cost — Brad's columns, from the marketing cost ledger (LP-MCP sql/158).
 *
 * One row per LP sub-source for the selected market and window: Raw / Set /
 * Issue / % Issue / # Demo / % Demo / # Sold / STD % / Gross $ / Working $ /
 * Net Sales $ / Net per Issued Appointment / Invoice Cost / Calculated Cost /
 * Total Cost / Cost ÷ Issued leads / Mkt %. † = provisional (Lead Gurus feed,
 * no invoice yet, or the Canvass commission estimate). Calculated Cost is the
 * commissions, which count as lead-source cost (the user, 2026-10-19).
 *
 * 2026-10-19: lead sources only. Software, call center and held company-level
 * money are on /marketing-spend, where held spend and its recommendation now
 * live (the user: the scorecard is for sales).
 *
 * 2026-10-23 (handoff "Fix Sources & Lead Cost"):
 *   - dollars are sales on leads CREATED in the period, as LP 136 counts them
 *     (LP-MCP migration 20261023120000), so the default sort is Gross $;
 *   - sources with no sales and no cost sit in a collapsed "Other sources"
 *     section under the rest (the total still sums every row);
 *   - lead sources ONLY (the user, same day): no call center (it "should
 *     never merge with them" and "doesn't make sense there"), no software or
 *     company-wide line and no "All marketing" total. Those "belong only on
 *     the Marketing Spend tab" (Spend), which this table links to.
 */

type SortKey = "gross" | "total_cost" | "cost_per_issued" | "issued" | "net" | "raw" | "mkt_pct";

function costTone(mktPct: number | null, target: number): string {
  if (mktPct == null) return "text-slate-400";
  if (mktPct <= target) return "text-emerald-600 dark:text-emerald-400";
  if (mktPct <= target * 1.33) return "text-amber-600 dark:text-amber-400";
  return "text-brick-600 dark:text-brick-400";
}
const money2 = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
const cell = "py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300";
const otherToggle = "flex min-h-8 w-full items-center rounded-lg border border-dashed border-slate-300 px-3.5 py-2 text-left text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300";
/** Columns in the desktop table (Campaign + 17). */
const COLS = 18;

export function LeadCostTable({
  view,
  targetPct,
  needsMigration,
  error,
  spendHref = null,
}: {
  view: CostView | null;
  targetPct: number;
  needsMigration: boolean;
  error: string | null;
  spendHref?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("gross");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [showOther, setShowOther] = useState(false);
  const active = view;
  const rows = useMemo(() => active?.rows ?? [], [active]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number;
      const bv = (b[sortKey] ?? -Infinity) as number;
      return dir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, dir]);
  const { primary, other: quiet } = useMemo(() => splitPrimaryRows(sorted), [sorted]);

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
        {r.campaign}{r.provisional ? <span title="Provisional: Lead Gurus feed until the invoice, or the Canvass commission estimate"> †</span> : null}
      </td>
      <td className={cell}>{num(r.raw)}</td>
      <td className={cell}>{num(r.set)}</td>
      <td className={cell}>{num(r.issued)}</td>
      <td className={cell}>{na(r.issue_pct, pct)}</td>
      <td className={cell}>{num(r.demos)}</td>
      <td className={cell}>{na(r.demo_pct, pct)}</td>
      <td className={cell}>{num(r.sold)}</td>
      <td className={cell}>{na(r.std_pct, pct)}</td>
      <td className={`${cell} hidden lg:table-cell`}>{usd(r.gross)}</td>
      <td className={`${cell} hidden lg:table-cell`}>{usd(r.working)}</td>
      <td className={cell}>{usd(r.net)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{na(r.nsli, usd)}</td>
      <td className={cell}>{money2(r.invoice_cost)}</td>
      <td className={cell}>{money2(r.calculated_cost)}</td>
      <td className={`${cell} font-semibold`}>{money2(r.total_cost)}</td>
      <td className={`${cell} font-semibold`}>{na(r.cost_per_issued, money2)}</td>
      <td className={`${cell} ${costTone(r.mkt_pct, targetPct)}`}>{na(r.mkt_pct, pct)}</td>
    </tr>
  );


  const renderCard = (r: CostRow) => {
    const metrics: { label: string; value: string; tone?: string }[] = [
      { label: "Issued", value: num(r.issued) },
      { label: "Cost / Issued", value: na(r.cost_per_issued, money2) },
      { label: "Total cost", value: money2(r.total_cost) },
      { label: "Gross $", value: usd(r.gross) },
      { label: "Net sales", value: usd(r.net) },
      { label: "Mkt %", value: na(r.mkt_pct, pct), tone: costTone(r.mkt_pct, targetPct) },
    ];
    return (
      <div key={r.campaign} className="rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] font-medium text-slate-700 dark:text-slate-200">
            {r.campaign}{r.provisional ? " †" : ""}
          </span>
          <span className="shrink-0 font-mono text-[14px] font-semibold tabular text-slate-900 dark:text-slate-100">{usd(r.gross)}</span>
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
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Lead Cost</h3>
          <InfoPopover helpKey="scorecard.leadcost" />
          <span className="text-xs text-slate-400">
            Cost ÷ issued leads · target ≤ {targetPct}% of net · $ = sales on leads created in the period · Net = RTP&apos;d + completed jobs
            {view?.as_of_snapshot ? ` · job status as of ${view.as_of_snapshot}` : ""}
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
          <p className="mb-3 rounded-md border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-700 dark:border-brick-900 dark:bg-brick-950/40 dark:text-brick-300">
            Lead cost could not be read: {error}
          </p>
        )}
        {view && !view.any_cost && !needsMigration && (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            No marketing cost in the ledger for this window yet. Costs arrive from invoices approved in #marketing-invoice-review, the Lead Gurus feed and the monthly commission rules.
          </p>
        )}

        {/* How many sources are over the target. */}
        {active && rows.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
            {(() => {
              const judged = rows.filter((r) => r.mkt_pct != null);
              const over = judged.filter((r) => (r.mkt_pct as number) > targetPct);
              return (
                <span className={`rounded-md border px-2.5 py-1 ${over.length ? "border-brick-200 bg-brick-50 text-brick-700 dark:border-brick-900 dark:bg-brick-950/40 dark:text-brick-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                  Sources: {over.length ? `${over.length} of ${judged.length} over ${targetPct}%` : `all ${judged.length} within ${targetPct}%`}
                </span>
              );
            })()}
          </div>
        )}

        {/* Phone + tablet: stacked cards */}
        <div className="space-y-2 lg:hidden">
          {primary.map(renderCard)}
          {quiet.length > 0 && (
            <button type="button" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther} className={otherToggle}>
              {showOther ? "▾" : "▸"} Other sources ({quiet.length}) — no sales or cost this period
            </button>
          )}
          {showOther && quiet.map(renderCard)}
          {active && rows.length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-3 text-[13px] dark:border-slate-700 dark:bg-slate-900/60">
              <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100">
                <span>All lead sources</span><span className="font-mono tabular">{money2(active.totals.total_cost)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Gross $</span><span className="font-mono tabular">{usd(active.totals.gross)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Cost ÷ issued ({num(active.totals.issued)} issued)</span><span className="font-mono tabular">{na(active.totals.cost_per_issued, money2)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Mkt %</span><span className={`font-mono tabular ${costTone(active.totals.mkt_pct, targetPct)}`}>{na(active.totals.mkt_pct, pct)}</span>
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
                <th className="hidden py-2 pl-3 text-right font-medium lg:table-cell" title="Sales on leads created in the period (as LP 136)">{sortable("gross", "Gross $")}</th>
                <th className="hidden py-2 pl-3 text-right font-medium lg:table-cell">Working $</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("net", "Net Sales $")}</th>
                <th className="hidden py-2 pl-3 text-right font-medium xl:table-cell" title={METRIC_LABELS.netPerIssuedAppointment}>Net $ / Issued</th>
                <th className="py-2 pl-3 text-right font-medium">Invoice Cost</th>
                <th className="py-2 pl-3 text-right font-medium" title="Commissions: Canvass 15% (estimate until canvasser payroll), MVP Marketing 15%, LeadPilotData 15% of net. Previous Customer and Customer Referral carry no cost">Calculated Cost</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("total_cost", "Total Cost")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("cost_per_issued", "Cost / Issued Lead")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("mkt_pct", "Mkt %")}</th>
              </tr>
            </thead>
            <tbody>
              {primary.map((r) => renderRow(r))}
              {quiet.length > 0 && (
                <tr className="border-b border-slate-100 dark:border-slate-800/60">
                  <td colSpan={COLS} className="py-1.5">
                    <button type="button" onClick={() => setShowOther((v) => !v)} aria-expanded={showOther} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                      {showOther ? "▾" : "▸"} Other sources ({quiet.length}) — no sales or cost this period
                    </button>
                  </td>
                </tr>
              )}
              {showOther && quiet.map((r) => renderRow(r))}
              {active && rows.length > 0 && renderRow(active.totals, true)}
            </tbody>
          </table>
        </div>

        {spendHref && (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Lead sources only. Call center, software and company-wide costs are on the Spend tab.{" "}
            <a href={spendHref} className="font-medium text-navy-700 underline-offset-2 hover:underline dark:text-slate-200">Every cost and vendor: Spend →</a>
          </p>
        )}
        {rows.some((r) => r.provisional) && (
          <p className="mt-2 text-[11px] text-slate-400">† provisional: Lead Gurus feed spend until the invoice replaces it at month close, or the Canvass commission, a 15%-of-net estimate until canvasser payroll is uploaded.</p>
        )}
      </CardContent>
    </Card>
  );
}
