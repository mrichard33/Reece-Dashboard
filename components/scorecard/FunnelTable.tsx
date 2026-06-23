import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct, goalTone } from "./format";
import { BulletBar } from "./Bars";
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
  periodGoal: number | null;
  actual: number | null;
  lowerIsBetter?: boolean;
  /** ⚠ definition provisional until reconciled (§4). */
  provisional?: boolean;
  /** Reason the actual is "—" (e.g. issued dimension not in the cache). */
  note?: string;
};

function fmt(v: number | null, kind: Fmt): string {
  if (v === null || v === undefined) return "—";
  if (kind === "usd") return usd(v);
  if (kind === "pct") return pct(v);
  return num(Math.round(v));
}

/**
 * The core funnel table: Metric | Monthly Goal | Period Goal | Actual, with a
 * bullet bar reading actual-vs-period-goal. The middle column is prorated to the
 * selected window (clearly a pro-rate, not a monthly figure). Values come from
 * the read-time query layer — no client recompute.
 *
 * ⚠ "Leads (Issued)" and the report's Demo% are "—": the cache has no issued
 * dimension (deferred LP enrichment). Sales/Demos/Close% are the audited-accurate
 * cells; Good Rate / Good Business / KO% stay provisional pending §4.
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

  // Prorate monthly counts by the same calendar fraction used for the $ goal.
  const periodFactor =
    goals.monthly_goal_dollars > 0
      ? derived.period_goal_dollars / goals.monthly_goal_dollars
      : actuals.days_elapsed / (goals.working_days || 1);
  const prorate = (v: number | null) => (v == null ? null : v * periodFactor);

  const rows: Row[] = [
    {
      label: "Leads (Issued)",
      fmt: "count",
      monthlyGoal: monthlyIssued,
      periodGoal: prorate(monthlyIssued),
      actual: actuals.issued,
      note: "Issued not in cache yet — needs LP issued field (deferred).",
    },
    { label: "Close %", fmt: "pct", monthlyGoal: goals.target_close_pct, periodGoal: goals.target_close_pct, actual: actuals.close_pct },
    { label: "Sales", fmt: "count", monthlyGoal: monthlySales, periodGoal: prorate(monthlySales), actual: actuals.sales },
    { label: "Demos", fmt: "count", monthlyGoal: monthlyDemos, periodGoal: prorate(monthlyDemos), actual: actuals.demos },
    { label: "Good Rate", fmt: "pct", monthlyGoal: goals.target_good_rate_pct, periodGoal: goals.target_good_rate_pct, actual: actuals.good_rate_pct, provisional: true },
    { label: "Good Business $", fmt: "usd", monthlyGoal: goals.monthly_goal_dollars, periodGoal: derived.period_goal_dollars, actual: actuals.good_business, provisional: true },
    { label: "Demo %", fmt: "pct", monthlyGoal: goals.target_demo_pct, periodGoal: goals.target_demo_pct, actual: actuals.demo_pct, note: "Report Demo% = demos ÷ issued; issued not in cache yet." },
    { label: "KO %", fmt: "pct", monthlyGoal: goals.target_ko_pct, periodGoal: goals.target_ko_pct, actual: actuals.ko_pct, lowerIsBetter: true, provisional: true },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Marketing / Sales — Actual vs Goal
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
              <th className="py-2 text-right font-medium">Period Goal</th>
              <th className="py-2 text-right font-medium">Actual</th>
              <th className="hidden w-40 py-2 pl-4 text-left font-medium sm:table-cell">Pace</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                <td className="py-2 text-left text-slate-700 dark:text-slate-300">
                  {r.label}
                  {r.provisional && (
                    <span title="Provisional definition — pending tie-out to the Reece export" className="ml-1 text-amber-500">
                      ⚠
                    </span>
                  )}
                  {r.note && (
                    <span title={r.note} className="ml-1 cursor-help text-slate-400">
                      †
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono tabular text-slate-500 dark:text-slate-400">
                  {fmt(r.monthlyGoal, r.fmt)}
                </td>
                <td className="py-2 text-right font-mono tabular text-slate-500 dark:text-slate-400">
                  {fmt(r.periodGoal, r.fmt)}
                </td>
                <td className={`py-2 text-right font-mono tabular font-semibold ${goalTone(r.actual, r.periodGoal, r.lowerIsBetter)}`}>
                  {fmt(r.actual, r.fmt)}
                </td>
                <td className="hidden py-2 pl-4 align-middle sm:table-cell">
                  <BulletBar actual={r.actual} goal={r.periodGoal} lowerIsBetter={r.lowerIsBetter} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
          Period Goal is the monthly goal prorated to the selected window (calendar-days).
          † actual unavailable from the cache — see note. ⚠ provisional definition (pending reconciliation).
        </p>
      </CardContent>
    </Card>
  );
}
