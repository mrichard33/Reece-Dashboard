import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { usd } from "@/lib/utils";
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
    { label: "Close %", value: ptsStr(v.close_pts), cls: tone(v.close_pts) },
    { label: "Demo %", value: ptsStr(v.demo_pts), cls: tone(v.demo_pts) },
    { label: "Good Rate", value: ptsStr(v.good_rate_pts), cls: tone(v.good_rate_pts) },
    { label: "KO %", value: ptsStr(v.ko_pts), cls: tone(v.ko_pts, true) },
  ];

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
            Net Sales vs MTD Goal
          </span>
          <div className={`font-mono tabular text-2xl font-bold ${tone(derived.variance.dollars)}`}>
            {derived.variance.dollars >= 0 ? "+" : ""}
            {usd(derived.variance.dollars)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5">
              <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {r.label}
              </span>
              <span className={`font-mono tabular font-semibold ${r.cls}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
