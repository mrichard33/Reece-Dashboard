import { num, usd } from "@/lib/utils";
import { ScSection } from "./ScSection";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";

/**
 * Section ① — Goal & Pace. The 5-second read: a flat horizontal band of eight
 * KPIs (no gauge). Projected Pace and Balance are colored vs the monthly goal.
 */

type Kpi = { label: string; sub: string; value: string; tone?: "pos" | "neg" | "plain"; title?: string; flag?: boolean };

/** Compact window label for the KPI sub-line — matches the goal editor's wording. */
function shortWindowLabel(w: string | null): string {
  switch (w) {
    case "rolling_90d": return "rolling 90d";
    case "trailing_3": return "trailing 3mo";
    case "trailing_6": return "trailing 6mo";
    case "trailing_12": return "trailing 12mo";
    case "company": return "company-wide";
    default: return "—";
  }
}

/** Human label for the trailing rate window (transparency tooltip). */
function windowLabel(w: string | null): string {
  switch (w) {
    case "rolling_90d": return "rolling 90 days";
    case "trailing_3": return "trailing 3 mo";
    case "trailing_6": return "trailing 6 mo";
    case "trailing_12": return "trailing 12 mo";
    case "company": return "company-wide (market too thin)";
    default: return "—";
  }
}

export function PaceHero({ vm }: { vm: ScorecardVM }) {
  const p = vm.pace;

  // Projected period-end net = current net run-rate × selling days in the whole
  // period (whole year for YTD, the month for a month view).
  const projected = p.daysElapsed > 0 ? Math.round((p.netSales / p.daysElapsed) * p.sellingDays) : 0;
  // Balance = net vs the prorated target-to-date (dollars ahead of / behind pace).
  const balance = Math.round(p.gap);
  // Projected Pace and Balance share the pace verdict: with a per-working-day goal,
  // beating the projected period goal ⇔ being ahead of the to-date target.
  const balTone: Kpi["tone"] = balance >= 0 ? "pos" : "neg";
  const projTone: Kpi["tone"] = p.monthlyGoal <= 0 ? "plain" : balTone;
  const signed = (v: number) => (v >= 0 ? "+" : "") + usd(v);

  // Transparency: how NSLI / average sale / issue rate were computed (window +
  // contracts + the period-scoped anchor month the window ends before).
  const anchorLabel = p.rateAnchorMonth
    ? ` · anchored ${p.rateAnchorMonth.slice(0, 7)}${p.ratePeriodScoped ? " (period-scoped)" : ""}`
    : "";
  const rateTitle = p.rateWindow
    ? `Basis: ${windowLabel(p.rateWindow)} · ${p.rateSampleN ?? 0} contracts${anchorLabel}`
    : undefined;
  // Issue rate rides the NSLI tile (no 9th KPI — it would orphan the 2/4/8 grid).
  const issuePct = p.issueRate != null ? ` · issue ${num(Math.round(p.issueRate * 100))}%` : "";
  // §7: the window is part of the number. The header used to say only
  // "trailing net ÷ leads issued" while the goal editor said "rolling 90d ·
  // n=344" — two labels, two different values, no way to tell which was which.
  // Both surfaces now name the same window and sample size.
  const windowSub = p.rateWindow
    ? `${shortWindowLabel(p.rateWindow)}${p.rateSampleN != null ? ` · n=${num(p.rateSampleN)}` : ""}`
    : "no rate history";

  // Single month → "Monthly Goal / full month"; multi-month → "Period Goal / full period".
  const goalLabel = vm.isSingleMonth ? "Monthly Goal" : "Period Goal";
  const goalSub = vm.isSingleMonth ? "full month" : "full period";

  // No report-sourced net yet → Net / Projected / Balance render "—" (pending is
  // NOT zero; a fabricated $0 reads as "behind goal" and a full-gross cancellation).
  const pending = p.netPending;

  const kpis: Kpi[] = [
    { label: goalLabel, sub: goalSub, value: usd(p.monthlyGoal) },
    {
      label: "Projected Pace",
      sub: pending ? "report pending" : projTone === "neg" ? "behind goal" : "on / ahead of goal",
      value: pending ? "—" : usd(projected),
      tone: pending ? "plain" : projTone,
    },
    { label: "Target to Date", sub: "goal to date", value: usd(p.paceGoal) },
    {
      label: `Net — Released ${vm.abbr}`,
      sub: pending ? "report pending — no released figure yet" : vm.provisional ? "provisional · ties to report at close" : "released to production (RTP)",
      value: pending ? "—" : usd(p.netSales),
    },
    {
      label: "Balance",
      sub: pending ? "report pending" : balance >= 0 ? "ahead of target" : "behind target",
      value: pending ? "—" : signed(balance),
      tone: pending ? "plain" : balTone,
    },
    { label: "Elapsed / Working Days", sub: `${num(Math.round(p.elapsedPct))}% of period`, value: `${num(p.daysElapsed)} / ${num(p.sellingDays)}` },
    { label: "Average Sale", sub: `net ÷ sales · ${windowSub}`, value: p.avgSale > 0 ? usd(p.avgSale) : "—", title: rateTitle, flag: p.rateWidened },
    { label: "NSLI", sub: `net ÷ leads issued · ${windowSub}${issuePct}`, value: p.nsli > 0 ? usd(p.nsli) : "—", title: rateTitle, flag: p.rateWidened },
  ];

  const toneCls = (t: Kpi["tone"]) =>
    t === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "neg"
        ? "text-brick"
        : "text-slate-900 dark:text-slate-100";

  return (
    <ScSection
      id="sc-pace"
      label="Goal & Pace"
      tail="the 5-second read"
      meta={`${p.sellingDays} working days · ${p.daysElapsed} elapsed`}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-100 px-4 py-5 dark:border-slate-800/70 sm:grid-cols-4 sm:gap-x-6 sm:px-5 xl:grid-cols-8">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0" title={k.title}>
            <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {k.label}
            </div>
            <div className={`mt-1.5 truncate font-mono text-[15px] font-semibold leading-none tabular sm:text-[18px] ${toneCls(k.tone)}`}>
              {k.value}
            </div>
            <div className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
              {k.sub}
              {/* Widened-window fallback is VISIBLE, never a silent substitution
                  (thin history → the basis tooltip names the wider window). */}
              {k.flag ? (
                <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">· widened window</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </ScSection>
  );
}
