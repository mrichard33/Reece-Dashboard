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
  /** Optional per-KPI help popover key. */
  helpKey?: string;
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

  // Rows mirror the Reece "Marketing Sub-Source By Appt Date" report, in order.
  // ⚠ = provisional (Net columns / NSLI) pending tie-out to the official report.
  const rows: Row[] = [
    { label: "Set", fmt: "count", monthlyGoal: null, mtdGoal: null, actual: actuals.sets },
    { label: "Issued", fmt: "count", monthlyGoal: monthlyIssued, mtdGoal: prorate(monthlyIssued), actual: actuals.issued },
    { label: "Net Issue", fmt: "count", monthlyGoal: null, mtdGoal: null, actual: actuals.net_issue, provisional: true },
    { label: "% Issue", fmt: "pct", monthlyGoal: null, mtdGoal: null, actual: actuals.pct_issue },
    { label: "Demos", fmt: "count", monthlyGoal: monthlyDemos, mtdGoal: prorate(monthlyDemos), actual: actuals.demos, helpKey: "scorecard.kpi.demos" },
    { label: "% Demo", fmt: "pct", monthlyGoal: goals.target_demo_pct, mtdGoal: goals.target_demo_pct, actual: actuals.demo_pct },
    { label: "Sold", fmt: "count", monthlyGoal: monthlySales, mtdGoal: prorate(monthlySales), actual: actuals.sales },
    { label: "% Gross Close", fmt: "pct", monthlyGoal: goals.target_close_pct, mtdGoal: goals.target_close_pct, actual: actuals.close_pct, helpKey: "scorecard.kpi.closePct" },
    { label: "# Net Close", fmt: "count", monthlyGoal: null, mtdGoal: null, actual: actuals.net_close, provisional: true, helpKey: "scorecard.kpi.netClose" },
    { label: "% Net Close", fmt: "pct", monthlyGoal: null, mtdGoal: null, actual: actuals.pct_net_close, provisional: true },
    { label: "Gross Sale $", fmt: "usd", monthlyGoal: null, mtdGoal: null, actual: actuals.gross_sales },
    { label: "Net Sales (Released)", fmt: "usd", monthlyGoal: goals.monthly_goal_dollars, mtdGoal: derived.mtd_goal_dollars, actual: actuals.net_sales, provisional: true, helpKey: "scorecard.kpi.netsales" },
    { label: "Working Revenue", fmt: "usd", monthlyGoal: null, mtdGoal: null, actual: actuals.working_dollars, provisional: true, helpKey: "scorecard.kpi.working" },
    { label: "Open Quotes", fmt: "usd", monthlyGoal: null, mtdGoal: null, actual: actuals.raw_inputs?.bucket_tally?.other_pending ?? null, provisional: true, helpKey: "scorecard.kpi.openQuotes" },
    { label: "GSLI", fmt: "usd", monthlyGoal: null, mtdGoal: null, actual: actuals.gsli },
    { label: "NSLI", fmt: "usd", monthlyGoal: goals.trailing_nsli || null, mtdGoal: goals.trailing_nsli || null, actual: actuals.nsli, provisional: true, helpKey: "scorecard.kpi.nsli" },
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
                  <span className="inline-flex items-center gap-1">
                    {r.label}
                    {r.provisional && (
                      <span
                        title="Provisional definition — pending tie-out to the Reece export"
                        className="text-amber-500"
                      >
                        ⚠
                      </span>
                    )}
                    {r.helpKey && <InfoPopover helpKey={r.helpKey} align="left" />}
                  </span>
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
