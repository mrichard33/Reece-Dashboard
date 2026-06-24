import { Badge } from "@/components/ui/Badge";
import { num } from "@/lib/utils";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** One-line meta bar: snapshot date, window, selling-day progress, raw leads. */
export function SnapshotStrip({ vm }: { vm: ScorecardVM }) {
  const s = vm.snapshot;
  const items: [string, string][] = [
    ["Snapshot", s.asOfDate],
    ["Window", s.rangeLabel],
    ["Selling days", `${s.daysElapsed} of ${s.sellingDays}`],
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
