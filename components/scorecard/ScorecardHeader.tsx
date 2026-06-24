import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import type {
  ScorecardActuals,
  ScorecardGoals,
  ScorecardDerived,
} from "@/lib/queries/scorecard";

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="font-mono tabular text-sm font-semibold text-navy-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

/** Goal/pace KPI grid above the funnel table (the Monday-a.m. header band). */
export function ScorecardHeader({
  actuals,
  goals,
  derived,
}: {
  actuals: ScorecardActuals;
  goals: ScorecardGoals;
  derived: ScorecardDerived;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Goal &amp; Pace
          </h3>
          <InfoPopover helpKey="scorecard.header" />
        </div>
        <span className="text-xs text-slate-500">
          {actuals.period_start} → {actuals.period_end}
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Cell label="Working Days" value={num(goals.working_days)} />
          <Cell label="Days Elapsed" value={num(actuals.days_elapsed)} />
          <Cell label="Monthly Goal" value={usd(derived.monthly_goal_dollars)} />
          <Cell label="MTD Goal" value={usd(derived.mtd_goal_dollars)} />
          <Cell label="Net Sales MTD" value={usd(actuals.net_sales)} />
          <Cell label="Good Business" value={usd(actuals.good_business)} />
          <Cell label="Avg Sale" value={actuals.avg_sale == null ? "—" : usd(actuals.avg_sale)} />
          <Cell label="NSLI" value={actuals.nsli == null ? "—" : usd(actuals.nsli)} />
          <Cell label="Gross Sales" value={usd(actuals.gross_sales)} />
          <Cell label="Working Rev" value={usd(actuals.pending_dollars)} />
          <Cell label="Demo %" value={pct(actuals.demo_pct)} />
          <Cell label="Trailing NSLI" value={goals.trailing_nsli ? usd(goals.trailing_nsli) : "—"} />
        </div>
      </CardContent>
    </Card>
  );
}
