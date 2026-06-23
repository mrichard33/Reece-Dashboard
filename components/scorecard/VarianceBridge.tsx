import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { usd } from "@/lib/utils";
import { DivergingBar } from "./Bars";
import type { ScorecardDerived } from "@/lib/queries/scorecard";

function ptsStr(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} pts`;
}

function tone(v: number | null, lowerIsBetter = false): string {
  if (v === null || v === undefined) return "text-slate-800 dark:text-slate-200";
  const good = lowerIsBetter ? v <= 0 : v >= 0;
  return good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

/** "Won/Lost Due to Goal Performance" bridge. ⚠ TIE-OUT — render but flag provisional. */
export function VarianceBridge({ derived }: { derived: ScorecardDerived }) {
  const v = derived.variance;
  const rows = [
    { label: "Close %", value: v.close_pts, lowerIsBetter: false },
    { label: "Demo %", value: v.demo_pts, lowerIsBetter: false },
    { label: "Good Rate", value: v.good_rate_pts, lowerIsBetter: false },
    { label: "KO %", value: v.ko_pts, lowerIsBetter: true },
  ];
  // Scale the diverging bars to the largest point-gap on show (min 5 pts).
  const maxPts = Math.max(5, ...rows.map((r) => (r.value == null ? 0 : Math.abs(r.value))));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Won / Lost vs Goal
          </h3>
          <InfoPopover helpKey="scorecard.variance" />
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Provisional
        </span>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Net Sales vs Period Goal
          </span>
          <div className={`font-mono tabular text-2xl font-bold ${tone(v.dollars)}`}>
            {v.dollars == null ? "—" : `${v.dollars >= 0 ? "+" : ""}${usd(v.dollars)}`}
          </div>
        </div>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[5rem_1fr_4.5rem] items-center gap-3 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {r.label}
              </span>
              <DivergingBar value={r.value} max={maxPts} lowerIsBetter={r.lowerIsBetter} />
              <span className={`text-right font-mono tabular font-semibold ${tone(r.value, r.lowerIsBetter)}`}>
                {ptsStr(r.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
