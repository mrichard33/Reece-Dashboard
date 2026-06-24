import { Badge } from "@/components/ui/Badge";
import { ScCard } from "./ScCard";
import { RankedBars } from "./viz/RankedBars";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Job status tally — ranked horizontal bars of where jobs are piling up. */
export function StatusCard({ vm }: { vm: ScorecardVM }) {
  const s = vm.status;
  if (s.items.length === 0) return null;
  return (
    <ScCard
      id="sc-status"
      title="Job status tally"
      lead="Where jobs are piling up right now — the tallest bars are the biggest backlogs."
      info={{
        what: `The largest job-status buckets in the pipeline (top ${s.items.length} of ${s.total}).`,
        where: "Job status counts from LP raw data for this window.",
        fix: 'Tall bars at "HOLD" / "Awaiting" statuses are where jobs are stuck.',
      }}
      action={<span className="font-mono text-[11px] tabular text-slate-400">top {s.items.length} of {s.total}</span>}
    >
      <div className="p-5">
        <RankedBars items={s.items} />
        {s.dropped.length > 0 && (
          <div className="mt-4 flex items-center gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Dropped from demos</span>
            {s.dropped.map((d, i) => (
              <Badge key={i} tone="slate">{d.label} · {d.count}</Badge>
            ))}
          </div>
        )}
      </div>
    </ScCard>
  );
}
