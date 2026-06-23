import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct, goalTone } from "./format";
import type {
  ScorecardActuals,
  ScorecardGoals,
  ScorecardDerived,
} from "@/lib/queries/scorecard";

type Fmt = "count" | "pct" | "usd";

type Row = {
  label: string;
  fmt: Fmt;
  monthlyGoal: number | null;
  mtdGoal: number | null;
  actual: number | null;
  lowerIsBetter?: boolean;
  /** ⚠ TIE-OUT — definition provisional until reconciled. */
  provisional?: boolean;
};

function fmt(v: number | null, kind: Fmt): string {
  if (v === null || v === undefined) return "—";
  if (kind === "usd") return usd(v);
  if (kind === "pct") return pct(v);
  return num(Math.round(v));
}

/**
 * The core Monday-a.m. funnel table: three columns (Monthly Goal | MTD Goal |
 * MTD Actual) over the eight standard rows. Actual cells color vs goal. No
 * client recompute — values come from the read-time query layer.
 */
export function FunnelTable({
  actuals,
  goals,
  derived,
}: {
  actuals: ScorecardActuals;
  goals: ScorecardGoals;
  derived: ScorecardDerived;
}) {
  // Monthly count targets derive from goal $ ÷ trailing NSLI (⚠ TIE-OUT).
  const monthlyIssued =
    goals.trailing_nsli > 0 ? goals.monthly_goal_dollars / goals.trailing_nsli : null;
  const monthlyDemos =
    monthlyIssued != null ? monthlyIssued * (goals.target_demo_pct / 100) : null;
  const monthlySales =
    monthlyDemos != null ? monthlyDemos * (goals.target_close_pct / 100) : null;
  const prorate = (v: number | null) =>
    v == null ? null : v * (actuals.days_elapsed / (goals.working_days || 1));

  const rows: Row[] = [
    { label: "Leads (Issued)", fmt: "count", monthlyGoal: monthlyIssued, mtdGoal: prorate(monthlyIssued), actual: actuals.issued },
    { label: "Close %", fmt: "pct", monthlyGoal: goals.target_close_pct, mtdGoal: goals.target_close_pct, actual: actuals.close_pct, provisional: true },
    { label: "Sales", fmt: "count", monthlyGoal: monthlySales, mtdGoal: prorate(monthlySales), actual: actuals.sales },
    { label: "Demos", fmt: "count", monthlyGoal: monthlyDemos, mtdGoal: prorate(monthlyDemos), actual: actuals.demos },
    { label: "Good Rate", fmt: "pct", monthlyGoal: goals.target_good_rate_pct, mtdGoal: goals.target_good_rate_pct, actual: actuals.good_rate_pct, provisional: true },
    { label: "Good Business $", fmt: "usd", monthlyGoal: goals.monthly_goal_dollars, mtdGoal: derived.mtd_goal_dollars, actual: actuals.good_business, provisional: true },
    { label: "Demo %", fmt: "pct", monthlyGoal: goals.target_demo_pct, mtdGoal: goals.target_demo_pct, actual: actuals.demo_pct },
    { label: "KO %", fmt: "pct", monthlyGoal: goals.target_ko_pct, mtdGoal: goals.target_ko_pct, actual: actuals.ko_pct, lowerIsBetter: true, provisional: true },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Marketing / Sales — MTD vs Goal
          </h3>
          <InfoPopover helpKey="scorecard.funnel" />
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
              <th className="py-2 text-left font-medium">Metric</th>
              <th className="py-2 text-right font-medium">Monthly Goal</th>
              <th className="py-2 text-right font-medium">MTD Goal</th>
              <th className="py-2 text-right font-medium">MTD Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <td className="py-2 text-left text-slate-700 dark:text-slate-300">
                  {r.label}
                  {r.provisional && (
                    <span
                      title="Provisional definition — pending tie-out to the Reece export"
                      className="ml-1 text-amber-500"
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular text-slate-500 dark:text-slate-400">
                  {fmt(r.monthlyGoal, r.fmt)}
                </td>
                <td className="py-2 text-right font-mono tabular text-slate-500 dark:text-slate-400">
                  {fmt(r.mtdGoal, r.fmt)}
                </td>
                <td className={`py-2 text-right font-mono tabular font-semibold ${goalTone(r.actual, r.mtdGoal, r.lowerIsBetter)}`}>
                  {fmt(r.actual, r.fmt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
