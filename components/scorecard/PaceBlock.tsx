import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import type { ScorecardDerived } from "@/lib/queries/scorecard";

function n1(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(1);
}

/** Target vs Actual per-day pace (Issued / Demoed / Closed). ⚠ TIE-OUT targets. */
export function PaceBlock({ derived }: { derived: ScorecardDerived }) {
  const rows = [
    { label: "Issued / Day", target: derived.target_issued_per_day, actual: derived.actual_issued_per_day },
    { label: "Demoed / Day", target: derived.target_demoed_per_day, actual: derived.actual_demoed_per_day },
    { label: "Closed / Day", target: derived.target_closed_per_day, actual: derived.actual_closed_per_day },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Per-Day Pace
          </h3>
          <InfoPopover helpKey="scorecard.pace" />
        </div>
        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          Provisional
        </span>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <th className="py-2 text-left font-medium"> </th>
              <th className="py-2 text-right font-medium">Target</th>
              <th className="py-2 text-right font-medium">Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meets = r.target != null && r.actual >= r.target;
              return (
                <tr key={r.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="py-2 text-left text-slate-700 dark:text-slate-300">{r.label}</td>
                  <td className="py-2 text-right font-mono tabular text-slate-500 dark:text-slate-400">{n1(r.target)}</td>
                  <td className={`py-2 text-right font-mono tabular font-semibold ${r.target == null ? "text-slate-800 dark:text-slate-200" : meets ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {n1(r.actual)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
