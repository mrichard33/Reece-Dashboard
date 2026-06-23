import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import type {
  ScorecardActuals,
  ScorecardGoals,
  ScorecardDerived,
} from "@/lib/queries/scorecard";

function Cell({
  label,
  value,
  provisional,
}: {
  label: string;
  value: string;
  provisional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
        {provisional && (
          <span title="Provisional — pending reconciliation (§4)" className="ml-1 text-amber-500">
            ⚠
          </span>
        )}
      </span>
      <span className="text-right font-mono tabular text-sm font-semibold tracking-tight text-navy-900 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function Cluster({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3 dark:border-slate-800/80">
      <h4 className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

/**
 * Goal/pace KPI band above the funnel, grouped into Goal · Pace · $ Pipeline ·
 * Inventory clusters. All values are read-time derived; $ Pipeline and Inventory
 * read the job cache and show "—" when unavailable. ⚠ marks provisional fields.
 */
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
        <span className="font-mono text-xs text-slate-500">
          {num(actuals.days_elapsed)} of {num(goals.working_days)} working days
        </span>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cluster title="Goal">
            <Cell label="Monthly Goal" value={usd(derived.monthly_goal_dollars)} />
            <Cell label="Goal / Day" value={usd(derived.goal_per_day)} />
            <Cell label="Target to Date" value={usd(derived.period_goal_dollars)} />
            <Cell label="Balance" value={usd(derived.balance)} />
          </Cluster>

          <Cluster title="Pace">
            <Cell label="Per-Day Actual" value={usd(derived.per_day_actual)} provisional />
            <Cell label="Good Business" value={usd(actuals.good_business)} provisional />
            <Cell label="Projected" value={usd(derived.projected_good_business)} provisional />
            <Cell label="Projected Balance" value={usd(derived.projected_balance)} provisional />
          </Cluster>

          <Cluster title="$ Pipeline">
            <Cell label="Gross Sales" value={usd(actuals.gross_sales)} />
            <Cell label="Net Sales" value={usd(actuals.net_sales)} provisional />
            <Cell label="Pending" value={usd(actuals.pending_dollars)} />
            <Cell label="Deposits" value={usd(actuals.deposits)} />
            <Cell label="Avg Sale" value={usd(actuals.avg_sale)} />
            <Cell label="NSLI" value={usd(actuals.nsli)} provisional />
          </Cluster>

          <Cluster title="Inventory">
            <Cell label="Inventory — Jobs" value={num(actuals.inventory_jobs)} />
            <Cell label="Inventory — Due" value={usd(actuals.inventory_due)} />
            <Cell label="Trailing NSLI" value={goals.trailing_nsli ? usd(goals.trailing_nsli) : "—"} />
            <Cell label="Demo %" value={pct(actuals.demo_pct)} />
          </Cluster>
        </div>
      </CardContent>
    </Card>
  );
}
