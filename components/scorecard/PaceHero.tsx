import { usd } from "@/lib/utils";
import { ScSection } from "./ScSection";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ① — Goal & Pace. The 5-second read: a flat horizontal band of eight
 * KPIs (no gauge). Projected Pace and Balance are colored vs the monthly goal.
 */

type Kpi = { label: string; sub: string; value: string; tone?: "pos" | "neg" | "plain" };

export function PaceHero({ vm }: { vm: ScorecardVM }) {
  const p = vm.pace;

  // Projected month-end net = current net run-rate × selling days in the period.
  const projected = p.daysElapsed > 0 ? Math.round((p.netSales / p.daysElapsed) * p.sellingDays) : 0;
  // Balance = net vs the prorated target-to-date (dollars ahead of / behind pace).
  const balance = Math.round(p.gap);
  const projTone: Kpi["tone"] =
    p.monthlyGoal <= 0 ? "plain" : projected >= p.monthlyGoal ? "pos" : "neg";
  const balTone: Kpi["tone"] = balance >= 0 ? "pos" : "neg";
  const signed = (v: number) => (v >= 0 ? "+" : "") + usd(v);

  const kpis: Kpi[] = [
    { label: "Monthly Goal", sub: "full month", value: usd(p.monthlyGoal) },
    {
      label: "Projected Pace",
      sub: projTone === "pos" ? "on / ahead of goal" : "behind goal",
      value: usd(projected),
      tone: projTone,
    },
    { label: "Target to Date", sub: "prorated goal", value: usd(p.paceGoal) },
    { label: `Net (Good Biz) ${vm.abbr}`, sub: "gross − cancellations", value: usd(p.netSales) },
    {
      label: "Balance",
      sub: balance >= 0 ? "ahead of target" : "behind target",
      value: signed(balance),
      tone: balTone,
    },
    { label: "Working / Elapsed", sub: `${Math.round(p.elapsedPct)}% of period`, value: `${p.daysElapsed} / ${p.sellingDays}` },
    { label: "Average Sale", sub: "gross ÷ sales", value: usd(p.avgSale) },
    { label: "NSLI", sub: "net sales / lead issued", value: usd(p.nsli) },
  ];

  const toneCls = (t: Kpi["tone"]) =>
    t === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "neg"
        ? "text-brick"
        : "text-slate-900 dark:text-slate-100";

  return (
    <ScSection
      id="sc-pace"
      label="Goal & Pace"
      tail="the 5-second read"
      meta={`${p.sellingDays} working days · ${p.daysElapsed} elapsed`}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-slate-100 px-5 py-5 dark:border-slate-800/70 sm:grid-cols-4 xl:grid-cols-8">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0">
            <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {k.label}
            </div>
            <div className={`mt-1.5 font-mono text-[18px] font-semibold leading-none tabular ${toneCls(k.tone)}`}>
              {k.value}
            </div>
            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{k.sub}</div>
          </div>
        ))}
      </div>
    </ScSection>
  );
}
