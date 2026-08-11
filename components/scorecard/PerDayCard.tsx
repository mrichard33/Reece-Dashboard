import { usDate } from "@/lib/utils";
import { ScSection } from "./ScSection";
import { PaceDayBar } from "./viz/PaceDayBar";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Section ④ — Per-day pace. Average daily output vs the daily target line. */
export function PerDayCard({ vm }: { vm: ScorecardVM }) {
  return (
    <ScSection
      id="sc-perday"
      label="Per-Day Pace"
      // Live-sync sourced, like the funnel counts — no report equivalent
      // exists, so it carries its age rather than implying it has none.
      meta={`live sync through ${usDate(vm.snapshot.asOfDate)}`}
    >
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800/70">
        {vm.perDay.map((p) => (
          <PaceDayBar key={p.key} label={p.label} target={p.target} actual={p.actual} />
        ))}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          <span className="inline-block h-3 w-0.5 rounded bg-slate-500 dark:bg-slate-300" />
          vertical line = daily target (plan ÷ working days)
        </div>
      </div>
    </ScSection>
  );
}
