import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { usd } from "@/lib/utils";
import { ScCard } from "./ScCard";
import type { ScorecardActuals, ScorecardDerived } from "@/lib/queries/scorecard";
import type { LeadCostView } from "@/lib/queries/leadcost";

type AlertTone = "rose" | "amber" | "emerald" | "slate";
type Alert = { tone: AlertTone; label: string; text: string };

const WRAP: Record<AlertTone, string> = {
  rose: "border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10",
  amber: "border-amber-300/70 bg-[#FAF0C9]/50 dark:border-amber-500/30 dark:bg-amber-500/10",
  emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
  slate: "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/40",
};

/**
 * Derived, at-a-glance scorecard alerts: pace gap vs goal, working revenue held,
 * unmapped sources, and any source over the lead-cost target. Purely computed from
 * the data already on the page — rendered as the redesign's tinted banners.
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
    alerts.push({ tone: "rose", label: "Behind pace", text: `Net Sales ${usd(Math.abs(derived.variance.dollars))} behind the MTD goal.` });
  } else if (derived.variance.dollars > 0) {
    alerts.push({ tone: "emerald", label: "Ahead of pace", text: `Net Sales ${usd(derived.variance.dollars)} ahead of the MTD goal.` });
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
    <ScCard
      id="sc-alerts"
      title="Alerts"
      lead="What to act on first. Clear the red flag before the amber one."
      info={{
        what: "Plain-language flags derived from this window — what to act on first.",
        where: "Computed from the same snapshot figures shown below.",
        fix: "Each flag points to the section that explains it. Clear the red one first.",
      }}
    >
      <div className="space-y-2.5 p-4">
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No active scorecard alerts — pace, working revenue, sources, and lead cost all within range.
          </p>
        ) : (
          alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${WRAP[a.tone]}`}>
              <Badge tone={a.tone as BadgeTone}>{a.label}</Badge>
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">{a.text}</p>
            </div>
          ))
        )}
      </div>
    </ScCard>
  );
}
