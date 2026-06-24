import { Badge } from "@/components/ui/Badge";
import { ScCard } from "./ScCard";
import { PaceDayBar } from "./viz/PaceDayBar";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Per-day pace — average daily output vs the daily target line. */
export function PerDayCard({ vm }: { vm: ScorecardVM }) {
  return (
    <ScCard
      id="sc-perday"
      title="Per-day pace"
      lead="Average daily output vs the daily target line (plan ÷ selling days)."
      info={{
        what: "Average daily production vs the daily target (plan ÷ selling days).",
        where: "Actuals = window counts ÷ days elapsed; targets = monthly plan ÷ selling days.",
        fix: "A bar short of the tick means daily output is under plan for that step.",
      }}
      badge={
        <Badge tone="amber" className="bg-[#FAF0C9] text-[#0C2340] ring-amber-300/40 dark:bg-amber-500/10 dark:text-amber-200">
          Provisional
        </Badge>
      }
    >
      <div className="p-5">
        {vm.perDay.map((p) => (
          <PaceDayBar key={p.key} label={p.label} target={p.target} actual={p.actual} />
        ))}
      </div>
    </ScCard>
  );
}
