import { ArrowDown } from "lucide-react";
import { SC_COLOR } from "./colors";
import { Term } from "./Term";

export type FunnelStage = {
  key: string;
  label: string;
  actual: number;
  goal: number | null;
  conv: number | null;
  convLabel?: string;
};

function ConvChip({ pct, label }: { pct: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <ArrowDown size={11} className="text-slate-400" />
      <span className="font-mono tabular">{pct.toFixed(1)}%</span>
      {label && <span className="text-slate-400">{label}</span>}
    </span>
  );
}

/**
 * Set → Issued → Demos → Sold. Each row: a navy fill bar (∝ actual/max) with the
 * count inside, a goal notch at goal/max, and a +/− vs goal delta. Conversion
 * chips sit between consecutive stages. Bars go a lighter navy when behind goal.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => Math.max(s.actual, s.goal ?? 0)), 1);
  return (
    <div className="space-y-0">
      {stages.map((s, i) => {
        const w = (s.actual / max) * 100;
        const goalW = s.goal != null ? (s.goal / max) * 100 : null;
        const behind = s.goal != null && s.actual < s.goal;
        const next = stages[i + 1];
        return (
          <div key={s.key}>
            <div className="flex items-center gap-3 py-1.5">
              <div className="w-16 shrink-0 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                <Term k={s.label}>{s.label}</Term>
              </div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800/70">
                <div
                  className="sc-anim absolute inset-y-0 left-0 flex items-center rounded-md"
                  style={{
                    width: `${Math.max(w, 4)}%`,
                    background: behind ? SC_COLOR.navy600 : SC_COLOR.navy,
                  }}
                >
                  <span className="pl-2.5 font-mono text-[12.5px] font-semibold tabular text-white">
                    {s.actual.toLocaleString()}
                  </span>
                </div>
                {goalW != null && (
                  <div
                    className="absolute inset-y-0 w-px bg-slate-400 dark:bg-slate-500"
                    style={{ left: `${goalW}%` }}
                    title={`Goal ${s.goal!.toLocaleString()}`}
                  >
                    <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-400 dark:bg-slate-500" />
                  </div>
                )}
              </div>
              <div className="w-24 shrink-0 text-right">
                {s.goal != null ? (
                  <span
                    className={`font-mono text-[11px] tabular ${behind ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}
                  >
                    {behind ? "−" : "+"}
                    {Math.abs(s.actual - s.goal).toLocaleString()} vs goal
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">entry</span>
                )}
              </div>
            </div>
            {next && next.conv != null && (
              <div className="ml-3 flex items-center py-0.5 pl-16">
                <ConvChip pct={next.conv} label={next.convLabel} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
