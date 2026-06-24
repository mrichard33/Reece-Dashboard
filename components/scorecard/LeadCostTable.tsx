"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import type { LeadCostRow } from "@/lib/queries/leadcost";

type SortKey = "net_sales" | "spend" | "cost_pct" | "romi" | "leads";

function costTone(costPct: number | null, target: number): string {
  if (costPct == null) return "text-slate-400";
  if (costPct <= target) return "text-emerald-600 dark:text-emerald-400";
  if (costPct <= target * 1.33) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function LeadCostTable({
  rows,
  targetPct,
  asOfDate,
  anyConnected,
}: {
  rows: LeadCostRow[];
  targetPct: number;
  asOfDate: string;
  anyConnected: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("net_sales");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

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
    else {
      setSortKey(k);
      setDir("desc");
    }
  };
  const arrow = (k: SortKey) => (k === sortKey ? (dir === "desc" ? " ↓" : " ↑") : "");

  const cols: { key: SortKey; label: string }[] = [
    { key: "leads", label: "Leads" },
    { key: "net_sales", label: "Net Sales" },
    { key: "spend", label: "Spend" },
    { key: "cost_pct", label: "Cost %" },
    { key: "romi", label: "ROMI" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Lead Cost
          </h3>
          <InfoPopover helpKey="scorecard.leadcost" />
          <span className="text-xs text-slate-400">
            Target cost ≤ {targetPct}% of net sales · snapshot {asOfDate}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {!anyConnected && (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
            No spend feed connected yet. Cost % and ROMI populate per source once
            spend lands in <code>lp_source_spend_daily</code> (or the LeadGurus feed
            for the Lead Gurus source).
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <th className="py-2 pr-3 text-left font-medium">Source</th>
                <th className="py-2 pl-3 text-right font-medium">Close %</th>
                {cols.map((c) => (
                  <th key={c.key} className="py-2 pl-3 text-right font-medium">
                    <button type="button" onClick={() => onSort(c.key)} className="hover:text-slate-800 dark:hover:text-slate-200">
                      {c.label}
                      {arrow(c.key)}
                    </button>
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-medium">Cost / Lead</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.source} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="py-2 pr-3 text-left font-medium text-slate-700 dark:text-slate-300">
                    {r.source}
                    {r.source_system && (
                      <span className="ml-1.5 align-middle">
                        <Badge tone="slate">{r.source_system}</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-3 text-right font-mono tabular text-slate-600 dark:text-slate-400">{pct(r.close_pct)}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300">{num(r.leads)}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300">{usd(r.net_sales)}</td>
                  {r.connected ? (
                    <>
                      <td className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300">{usd(r.spend)}</td>
                      <td className={`py-2 pl-3 text-right font-mono tabular font-semibold ${costTone(r.cost_pct, targetPct)}`}>{pct(r.cost_pct)}</td>
                      <td className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300">{r.romi != null ? `${r.romi.toFixed(2)}×` : "—"}</td>
                      <td className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300">{usd(r.cost_per_lead)}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-2 pl-3 text-right text-xs italic text-slate-400">
                      Spend not connected
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
