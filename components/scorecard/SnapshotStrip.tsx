import { Badge } from "@/components/ui/Badge";
import { num } from "@/lib/utils";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** One-line meta bar: snapshot date, window, selling-day progress, raw leads. */
export function SnapshotStrip({ vm }: { vm: ScorecardVM }) {
  const s = vm.snapshot;

  // Selling days elapsed is a calendar fact, so this counts real elapsed days
  // even when the feed has stalled. When the actuals reach fewer days than have
  // elapsed, say so here rather than leaving a bare "8 of 26" next to numbers
  // that only cover six of them — the count and its coverage belong together.
  const behind = s.dataDaysElapsed != null && s.dataDaysElapsed < s.daysElapsed;
  const sellingDays = s.sellingDays > 0 ? String(s.sellingDays) : "—";

  const items: [string, string][] = [
    ["Snapshot", s.asOfDate],
    ["Window", s.rangeLabel],
    [
      "Selling days",
      behind
        ? `${s.daysElapsed} of ${sellingDays} · data covers ${s.dataDaysElapsed}`
        : `${s.daysElapsed} of ${sellingDays}`,
    ],
    ["Raw leads", s.rawLeads != null ? num(s.rawLeads) : "—"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white px-5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{k}</span>
          <span className="font-mono text-[12px] tabular text-slate-700 dark:text-slate-200">{v}</span>
        </div>
      ))}
      <span className="ml-auto">
        {s.reconciled ? (
          <Badge tone="emerald">Reconciled</Badge>
        ) : (
          <Badge tone="amber" className="bg-[#FAF0C9] text-[#0C2340] ring-amber-300/40 dark:bg-amber-500/10 dark:text-amber-200">
            Provisional · unreconciled
          </Badge>
        )}
      </span>
    </div>
  );
}
