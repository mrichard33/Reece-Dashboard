"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import { na, type CostRow, type CostView } from "@/lib/queries/marketingCost.core";
import { allMarketing, type OtherCosts } from "@/lib/queries/marketingSpend.core";
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
 * Under "All lead sources", the call center, software and company-wide lines
 * and an "All marketing" total, with its own Mkt % against the same target
 * (the user, 2026-10-19: "use both targets"): each source is judged on its
 * own cost, and the company on everything marketing costs.
 */

type SortKey = "total_cost" | "cost_per_issued" | "issued" | "net" | "raw" | "mkt_pct";

function costTone(mktPct: number | null, target: number): string {
  if (mktPct == null) return "text-slate-400";
  if (mktPct <= target) return "text-emerald-600 dark:text-emerald-400";
  if (mktPct <= target * 1.33) return "text-amber-600 dark:text-amber-400";
  return "text-brick-600 dark:text-brick-400";
}
const money2 = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));
const cell = "py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300";

export function LeadCostTable({
  view,
  targetPct,
  needsMigration,
  error,
  other = null,
  spendHref = null,
}: {
  view: CostView | null;
  targetPct: number;
  needsMigration: boolean;
  error: string | null;
  other?: OtherCosts | null;
  spendHref?: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total_cost");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const rows = useMemo(() => view?.rows ?? [], [view]);
  const all = view && rows.length > 0 ? allMarketing(view.totals, other) : null;

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
      <td className={`${cell} hidden xl:table-cell`}>{usd(r.gross)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{usd(r.working)}</td>
      <td className={cell}>{usd(r.net)}</td>
      <td className={`${cell} hidden xl:table-cell`}>{na(r.nsli, usd)}</td>
      <td className={cell}>{money2(r.invoice_cost)}</td>
      <td className={cell}>{money2(r.calculated_cost)}</td>
      <td className={`${cell} font-semibold`}>{money2(r.total_cost)}</td>
      <td className={`${cell} font-semibold`}>{na(r.cost_per_issued, money2)}</td>
      <td className={`${cell} ${costTone(r.mkt_pct, targetPct)}`}>{na(r.mkt_pct, pct)}</td>
    </tr>
  );

  // A cost-only row under the lead sources (call center, software, …) and the
  // "All marketing" total: only Net, Total Cost, Cost / Issued and Mkt % apply.
  const renderExtra = (key: string, label: string, v: { net?: number | null; total: number; perIssued?: number | null; mkt?: number | null }, bold = false) => (
    <tr key={key} className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${bold ? "border-t-2 border-t-slate-300 bg-slate-100 font-semibold dark:border-t-slate-600 dark:bg-slate-800/60" : ""}`}>
      <td className={`sticky left-0 py-2 pr-3 text-left font-medium text-slate-700 dark:text-slate-300 ${bold ? "bg-slate-100 dark:bg-slate-800" : "bg-white pl-3 dark:bg-slate-900"}`}>{label}</td>
      {Array.from({ length: 8 }, (_, i) => <td key={i} className={cell} />)}
      <td className={`${cell} hidden xl:table-cell`} />
      <td className={`${cell} hidden xl:table-cell`} />
      <td className={cell}>{v.net === undefined ? "" : usd(v.net)}</td>
      <td className={`${cell} hidden xl:table-cell`} />
      <td className={cell} />
      <td className={cell} />
      <td className={`${cell} font-semibold`}>{money2(v.total)}</td>
      <td className={`${cell} font-semibold`}>{v.perIssued === undefined ? "" : na(v.perIssued, money2)}</td>
      <td className={`${cell} ${v.mkt === undefined ? "" : costTone(v.mkt, targetPct)}`}>{v.mkt === undefined ? "" : na(v.mkt, pct)}</td>
    </tr>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Lead Cost</h3>
          <InfoPopover helpKey="scorecard.leadcost" />
          <span className="text-xs text-slate-400">
            Cost ÷ issued leads · target ≤ {targetPct}% of net · Net = RTP&apos;d + completed jobs
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
          <p className="mb-3 rounded-md border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-700 dark:border-brick-900 dark:bg-brick-950/40 dark:text-brick-300">
            Lead cost could not be read: {error}
          </p>
        )}
        {view && !view.any_cost && !needsMigration && (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            No marketing cost in the ledger for this window yet. Costs arrive from invoices approved in #marketing-invoice-review, the Lead Gurus feed and the monthly commission rules.
          </p>
        )}

        {/* Both targets at a glance (the user, 2026-10-19): each source on its own, and the company all-in. */}
        {all && (
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
            {all.mkt_pct != null && (
              <span className={`rounded-md border px-2.5 py-1 ${all.mkt_pct > targetPct ? "border-brick-200 bg-brick-50 text-brick-700 dark:border-brick-900 dark:bg-brick-950/40 dark:text-brick-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
                All marketing: {pct(all.mkt_pct)} of net ({all.mkt_pct > targetPct ? "over" : "within"} {targetPct}%)
              </span>
            )}
          </div>
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
                <span>All lead sources</span><span className="font-mono tabular">{money2(view.totals.total_cost)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Cost ÷ issued ({num(view.totals.issued)} issued)</span><span className="font-mono tabular">{na(view.totals.cost_per_issued, money2)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                <span>Mkt %</span><span className={`font-mono tabular ${costTone(view.totals.mkt_pct, targetPct)}`}>{na(view.totals.mkt_pct, pct)}</span>
              </div>
              {all && all.lines.length > 0 && (
                <>
                  {all.lines.map((l) => (
                    <div key={l.category} className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                      <span>+ {l.label}</span><span className="font-mono tabular">{money2(l.cost)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-slate-300 pt-2 font-semibold text-slate-800 dark:border-slate-600 dark:text-slate-100">
                    <span>All marketing</span><span className="font-mono tabular">{money2(all.total_cost)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Cost ÷ issued</span><span className="font-mono tabular">{na(all.cost_per_issued, money2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Mkt %</span><span className={`font-mono tabular ${costTone(all.mkt_pct, targetPct)}`}>{na(all.mkt_pct, pct)}</span>
                  </div>
                </>
              )}
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
                <th className="py-2 pl-3 text-right font-medium" title="Commissions: Canvass 15% (estimate until canvasser payroll), MVP Marketing 15%, LeadPilotData 15%, Previous Customer / Referral 1% of net">Calculated Cost</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("total_cost", "Total Cost")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("cost_per_issued", "Cost / Issued Lead")}</th>
                <th className="py-2 pl-3 text-right font-medium">{sortable("mkt_pct", "Mkt %")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => renderRow(r))}
              {view && rows.length > 0 && renderRow(view.totals, true)}
              {all && all.lines.length > 0 && all.lines.map((l) => renderExtra(l.category, `+ ${l.label}`, { total: l.cost }))}
              {all && all.lines.length > 0 && renderExtra("all", "All marketing", { net: all.net, total: all.total_cost, perIssued: all.cost_per_issued, mkt: all.mkt_pct }, true)}
            </tbody>
          </table>
        </div>

        {all && (all.lines.length > 0 || all.parked > 0) && (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            All marketing = lead sources + call center + software{all.lines.some((l) => l.category === "company_wide") ? " + company-wide" : ""}, judged against the same {targetPct}% target.
            {all.parked > 0 ? ` Held or disputed money (${money2(all.parked)}) is not included.` : ""}
            {spendHref ? <> <a href={spendHref} className="font-medium text-navy-700 underline-offset-2 hover:underline dark:text-slate-200">Every vendor and invoice: Marketing Spend →</a></> : null}
          </p>
        )}
        {rows.some((r) => r.provisional) && (
          <p className="mt-2 text-[11px] text-slate-400">† provisional: Lead Gurus feed spend until the invoice replaces it at month close, or the Canvass commission, a 15%-of-net estimate until canvasser payroll is uploaded.</p>
        )}
      </CardContent>
    </Card>
  );
}
