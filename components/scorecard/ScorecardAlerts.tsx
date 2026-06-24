import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { usd } from "@/lib/utils";
import type { ScorecardActuals, ScorecardDerived } from "@/lib/queries/scorecard";
import type { LeadCostView } from "@/lib/queries/leadcost";

type Alert = { tone: BadgeTone; label: string; text: string };

/**
 * Derived, at-a-glance scorecard alerts: pace gap vs goal, working revenue held,
 * unmapped sources, and any source over the lead-cost target. Purely computed from
 * the data already on the page — no extra fetch.
 */
export function ScorecardAlerts({
  actuals,
  derived,
  unmappedSources,
  leadCost,
}: {
  actuals: ScorecardActuals;
  derived: ScorecardDerived;
  unmappedSources: number;
  leadCost: LeadCostView | null;
}) {
  const alerts: Alert[] = [];

  // Pace vs MTD goal.
  if (derived.variance.dollars < 0) {
    alerts.push({
      tone: "rose",
      label: "Behind pace",
      text: `Net Sales ${usd(Math.abs(derived.variance.dollars))} behind the MTD goal.`,
    });
  } else if (derived.variance.dollars > 0) {
    alerts.push({
      tone: "emerald",
      label: "Ahead of pace",
      text: `Net Sales ${usd(derived.variance.dollars)} ahead of the MTD goal.`,
    });
  }

  // Working revenue held (sold but not released) relative to released.
  const working = actuals.working_dollars ?? 0;
  if (working > 0) {
    const rel = actuals.released_dollars ?? actuals.net_sales ?? 0;
    const pctOfRel = rel > 0 ? Math.round((working / rel) * 100) : null;
    alerts.push({
      tone: working > rel * 0.25 ? "amber" : "slate",
      label: "Working revenue",
      text: `${usd(working)} sold but held${pctOfRel != null ? ` (${pctOfRel}% of released)` : ""} — watch for stalls in financing/HOA/docs.`,
    });
  }

  // Unmapped sources.
  if (unmappedSources > 0) {
    alerts.push({
      tone: "amber",
      label: "Unmapped sources",
      text: `${unmappedSources} source${unmappedSources === 1 ? "" : "s"} not in lp_source_mapping — attribution incomplete.`,
    });
  }

  // Lead cost over target.
  if (leadCost) {
    const over = leadCost.rows.filter((r) => r.connected && r.cost_pct != null && r.cost_pct > leadCost.target_pct);
    if (over.length > 0) {
      const worst = over.reduce((a, b) => ((b.cost_pct ?? 0) > (a.cost_pct ?? 0) ? b : a));
      alerts.push({
        tone: "rose",
        label: "Lead cost",
        text: `${over.length} source${over.length === 1 ? "" : "s"} over the ${leadCost.target_pct}% cost target (worst: ${worst.source} at ${worst.cost_pct}%).`,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">
            Alerts
          </h3>
          <InfoPopover helpKey="scorecard.alerts" />
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No active scorecard alerts — pace, working revenue, sources, and lead cost
            all within range.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Badge tone={a.tone}>{a.label}</Badge>
                <span className="text-slate-700 dark:text-slate-300">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
