import { Badge } from "@/components/ui/Badge";
import { usd } from "@/lib/utils";
import { ScCard } from "./ScCard";
import { PaceGauge } from "./viz/PaceGauge";
import { SC_COLOR } from "./viz/colors";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/** Pace hero — the #1 question: are we ahead or behind the prorated goal? */
export function PaceHero({ vm }: { vm: ScorecardVM }) {
  const p = vm.pace;
  const tone = p.tone; // rose | amber | emerald
  const figs: [string, string, string][] = [
    [`Net sales ${vm.abbr}`, usd(p.netSales), "text-slate-900 dark:text-slate-100"],
    [`${vm.abbr} goal`, usd(p.paceGoal), "text-slate-500 dark:text-slate-400"],
    ["Monthly goal", usd(p.monthlyGoal), "text-slate-500 dark:text-slate-400"],
    ["Avg sale", usd(p.avgSale), "text-slate-900 dark:text-slate-100"],
  ];
  const fillColor = p.behind ? SC_COLOR.brick : SC_COLOR.emerald;

  return (
    <ScCard
      id="sc-pace"
      title={`Pace — net sales vs ${vm.abbr} goal`}
      lead={`The headline: how far net sales have come toward the ${vm.abbr} (prorated) goal you should have reached by today.`}
      info={{
        what: `The gauge is net sales as a share of the ${vm.abbr} (prorated) goal; the gap is dollars ahead/behind that pace.`,
        where: "Net sales (released) from LP raw data; goals from Edit Goals, prorated to days elapsed.",
        fix: "If the gauge looks wrong, confirm the monthly goal and selling days in Edit Goals.",
      }}
      badge={<Badge tone={tone} dot>{p.verdict}</Badge>}
    >
      <div className="grid grid-cols-1 items-center gap-6 p-5 lg:grid-cols-[auto_1fr] lg:gap-8">
        <div className="flex flex-col items-center justify-center">
          <PaceGauge pct={p.pctOfPace} tone={tone} />
          <div className={`mt-1 font-mono text-[13px] font-semibold tabular ${p.behind ? "text-brick" : "text-emerald-600 dark:text-emerald-400"}`}>
            {usd(p.gap)}
          </div>
          <div className="text-[11px] text-slate-400">
            {p.behind ? "behind" : "ahead of"} the {vm.abbr} goal
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            {figs.map(([label, val, cls], i) => (
              <div key={i}>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
                <div className={`mt-1 font-mono text-[17px] font-semibold tabular ${cls}`}>{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Time elapsed</span>
              <span className="font-mono tabular text-slate-400">
                {p.daysElapsed} / {p.sellingDays} days · {Math.round(p.elapsedPct)}%
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300 dark:bg-slate-600" style={{ width: `${p.elapsedPct}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(p.pctOfFull, 100)}%`, background: fillColor }} />
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /> time gone ({Math.round(p.elapsedPct)}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fillColor }} /> goal achieved ({Math.round(p.pctOfFull)}%)
              </span>
            </div>
          </div>
        </div>
      </div>
    </ScCard>
  );
}
