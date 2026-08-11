"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import type { SourceScorecardRow } from "@/lib/queries/sources";
import { METRIC_LABELS } from "@/lib/scorecard/labels";

type NumKey = Exclude<
  keyof SourceScorecardRow,
  "source" | "sub_source" | "bucket" | "unmapped"
>;

type Col = {
  key: NumKey;
  label: string;
  fmt: "count" | "pct" | "usd";
  /** higher is better unless set; only affects nothing today but documents intent */
  lowerIsBetter?: boolean;
};

// Kept tight on purpose; Phase 4 adds per-column popovers + the remaining columns.
const COLS: Col[] = [
  { key: "leads", label: "Leads", fmt: "count" },
  { key: "issued", label: "Issued", fmt: "count" },
  { key: "demo_pct", label: "Demo %", fmt: "pct" },
  { key: "close_pct", label: METRIC_LABELS.demoToSale, fmt: "pct" },
  { key: "net_sales", label: "Net Sales", fmt: "usd" },
  { key: "pending_total", label: "Pending", fmt: "usd" },
  { key: "nsli", label: "NSLI", fmt: "usd" },
];

function fmtCell(v: number | null, kind: Col["fmt"]): string {
  if (v === null || v === undefined) return "—";
  if (kind === "usd") return usd(v);
  if (kind === "pct") return pct(v);
  return num(Math.round(v));
}

/**
 * "Lead quality" signal: a source's close% vs the REECE average. Sources closing
 * below half the REECE average are flagged Weak (the acceptance threshold); at or
 * above the average is Strong. NSLI vs average is surfaced in the row title.
 */
function quality(
  closePct: number | null,
  refClose: number | null,
): { label: string; tone: "emerald" | "amber" | "rose" | "slate" } {
  if (closePct == null || !refClose) return { label: "—", tone: "slate" };
  const ratio = closePct / refClose;
  if (ratio >= 1) return { label: "Strong", tone: "emerald" };
  if (ratio >= 0.5) return { label: "OK", tone: "amber" };
  return { label: "Weak", tone: "rose" };
}

export function SourcePerformanceTable({
  rows,
  unmappedCount,
  asOfDate,
  referenceClosePct,
  referenceNsli,
}: {
  rows: SourceScorecardRow[];
  unmappedCount: number;
  asOfDate: string;
  referenceClosePct: number | null;
  referenceNsli: number | null;
}) {
  const [sortKey, setSortKey] = useState<NumKey>("net_sales");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, dir]);

  const onSort = (key: NumKey) => {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  const arrow = (key: NumKey) => (key === sortKey ? (dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Source Performance
          </h3>
          <InfoPopover helpKey="scorecard.sources" />
          <span className="text-xs text-slate-400">By Appt Date · snapshot {asOfDate}</span>
          {unmappedCount > 0 && (
            <span className="ml-auto">
              <Badge tone="amber" dot>
                {unmappedCount} unmapped source{unmappedCount === 1 ? "" : "s"}
              </Badge>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No per-source rows yet. They populate once the LP-MCP daily job runs the
            Phase 2 path.
          </p>
        ) : (
          <>
          {/* Phone + tablet: stacked cards */}
          <div className="space-y-2 lg:hidden">
            {sorted.map((r) => {
              const q = quality(r.close_pct, referenceClosePct);
              return (
                <div key={`${r.source}${r.sub_source}`} className="rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium text-slate-700 dark:text-slate-200">{r.source}</span>
                        {r.unmapped && <span title="Source does not resolve through lp_source_mapping" className="text-amber-500">⚠</span>}
                      </div>
                      {r.sub_source && r.sub_source !== "(none)" && (
                        <div className="text-[11px] text-slate-400">{r.sub_source}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-[14px] font-semibold tabular text-slate-900 dark:text-slate-100">{fmtCell(r.net_sales, "usd")}</span>
                      <Badge tone={q.tone}>{q.label}</Badge>
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
                    {COLS.filter((c) => c.key !== "net_sales").map((c) => (
                      <div key={c.key}>
                        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">{c.label}</div>
                        <div className="mt-0.5 font-mono text-[12.5px] tabular text-slate-700 dark:text-slate-200">{fmtCell(r[c.key], c.fmt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop / tablet: full table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3 text-left font-medium">Source</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="py-2 pl-3 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => onSort(c.key)}
                        className="hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {c.label}
                        {arrow(c.key)}
                      </button>
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const q = quality(r.close_pct, referenceClosePct);
                  const nsliVsRef =
                    r.nsli != null && referenceNsli
                      ? `NSLI ${usd(r.nsli)} vs REECE avg ${usd(referenceNsli)}`
                      : undefined;
                  return (
                    <tr
                      key={`${r.source}${r.sub_source}`}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                      title={nsliVsRef}
                    >
                      <td className="py-2 pr-3 text-left">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <span className="font-medium">{r.source}</span>
                          {r.unmapped && (
                            <span
                              title="Source does not resolve through lp_source_mapping"
                              className="text-amber-500"
                            >
                              ⚠
                            </span>
                          )}
                        </div>
                        {r.sub_source && r.sub_source !== "(none)" && (
                          <div className="text-xs text-slate-400">{r.sub_source}</div>
                        )}
                      </td>
                      {COLS.map((c) => (
                        <td
                          key={c.key}
                          className="py-2 pl-3 text-right font-mono tabular text-slate-700 dark:text-slate-300"
                        >
                          {fmtCell(r[c.key], c.fmt)}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right">
                        <Badge tone={q.tone}>{q.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
