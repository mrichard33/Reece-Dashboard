import { Badge } from "@/components/ui/Badge";
import { usd } from "@/lib/utils";
import { ScCard } from "./ScCard";
import { PaceGauge } from "./viz/PaceGauge";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ① — Goal & Pace. The top-of-page answer to "are we ahead or behind?",
 * as a compact pace gauge plus eight KPIs: Monthly Goal · Projected Pace · Target
 * to Date · Net (Good Business) · Balance · Working/Elapsed · Average Sale · NSLI.
 * Projected Pace and Balance are colored vs the monthly goal.
 */

type Kpi = { label: string; sub?: string; value: string; tone?: "pos" | "neg" | "plain" };

export function PaceHero({ vm }: { vm: ScorecardVM }) {
  const p = vm.pace;

  // Projected month-end net = current net run-rate × selling days in the period.
  const projected = p.daysElapsed > 0 ? Math.round((p.netSales / p.daysElapsed) * p.sellingDays) : 0;
  const balance = Math.round(p.monthlyGoal - p.netSales);
  const projTone: Kpi["tone"] =
    p.monthlyGoal <= 0 ? "plain" : projected >= p.monthlyGoal ? "pos" : "neg";
  // Balance is money still needed to hit goal; ≤ 0 means the goal is met/exceeded.
  const balTone: Kpi["tone"] = p.monthlyGoal <= 0 ? "plain" : balance <= 0 ? "pos" : "neg";

  const kpis: Kpi[] = [
    { label: "Monthly Goal", value: usd(p.monthlyGoal) },
    { label: "Projected Pace", value: usd(projected), tone: projTone },
    { label: `Target to Date`, value: usd(p.paceGoal) },
    { label: `Net (Good Business) ${vm.abbr}`, sub: "gross − cancellations", value: usd(p.netSales) },
    { label: "Balance", value: usd(balance), tone: balTone },
    { label: "Working / Elapsed", value: `${p.daysElapsed} / ${p.sellingDays} days` },
    { label: "Average Sale", value: usd(p.avgSale) },
    { label: "NSLI", value: usd(p.nsli) },
  ];

  const toneCls = (t: Kpi["tone"]) =>
    t === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "neg"
        ? "text-brick"
        : "text-slate-900 dark:text-slate-100";

  return (
    <ScCard
      id="sc-pace"
      title="Goal & Pace"
      lead={`How far net (good) business has come toward the ${vm.abbr} goal you should have reached by today.`}
      info={{
        what: `Net (Good Business) = gross sold − cancellations. Target to Date is the monthly goal scaled to selling days elapsed; Projected Pace extends today's run-rate to month end.`,
        where: "Net (released + working + other) from LP raw data; goals from Edit Goals.",
        fix: "If pace looks wrong, confirm the monthly goal and selling days in Edit Goals.",
      }}
      badge={<Badge tone={p.tone} dot>{p.verdict}</Badge>}
    >
      <div className="grid grid-cols-1 items-center gap-6 p-5 lg:grid-cols-[auto_1fr] lg:gap-8">
        <div className="flex flex-col items-center justify-center">
          <PaceGauge pct={p.pctOfPace} tone={p.tone} />
          <div className={`mt-1 font-mono text-[13px] font-semibold tabular ${p.behind ? "text-brick" : "text-emerald-600 dark:text-emerald-400"}`}>
            {usd(p.gap)}
          </div>
          <div className="text-[11px] text-slate-400">
            {p.behind ? "behind" : "ahead of"} the {vm.abbr} goal
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label}>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {k.label}
              </div>
              {k.sub && <div className="text-[9.5px] font-medium text-slate-400">{k.sub}</div>}
              <div className={`mt-1 font-mono text-[16px] font-semibold tabular ${toneCls(k.tone)}`}>
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScCard>
  );
}
