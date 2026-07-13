/**
 * Scorecard view model.
 *
 * Turns the live `ScorecardView` (actuals / goals / derived + raw_inputs tallies)
 * into the per-section shapes the redesigned visual story consumes — pace gauge,
 * funnel stages, rate bullets, revenue stack, per-day pace, ranked status bars,
 * and the collapsible Marketing/Sales detail table. Pure & deterministic so it
 * can be unit-tested; mirrors the prototype's `scComputeModel` but sourced from
 * real data instead of a pinned snapshot.
 */
import { usd, num } from "@/lib/utils";
import { pct } from "@/components/scorecard/format";
import type { FunnelStage } from "@/components/scorecard/viz/Funnel";
import type { RevenueBucket } from "@/components/scorecard/viz/RevenueStack";
import type { RankedItem } from "@/components/scorecard/viz/RankedBars";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";

// ── formatters specific to the scorecard visuals ────────────────────────────

/** Compact money for headline copy: $5.66M / $42K / $930. Signed. */
export function scMoneyShort(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e6) s = "$" + (a / 1e6).toFixed(2) + "M";
  else if (a >= 1e3) s = "$" + Math.round(a / 1e3) + "K";
  else s = "$" + Math.round(a);
  return neg ? "-" + s : s;
}

/** Percentage-point gap rendered with a `%` suffix (client preference): `+5.3%`. */
export function scPts(v: number, dp = 1): string {
  return (v >= 0 ? "+" : "") + v.toFixed(dp) + "%";
}

// ── period → short label ────────────────────────────────────────────────────

function abbrFor(key: ResolvedPeriod["key"]): string {
  switch (key) {
    case "week":
    case "last_week":
      return "WTD";
    case "trailing_3m":
      return "3MO";
    case "qtd":
      return "QTD";
    case "ytd":
      return "YTD";
    case "today":
    case "yesterday":
      return "DTD";
    case "custom":
      return "PTD";
    default:
      return "MTD";
  }
}

// ── VM shapes ───────────────────────────────────────────────────────────────

type Tone = "rose" | "amber" | "emerald";

export type MarketingRow = {
  metric: string;
  monthGoal: string | null;
  mtdGoal: string | null;
  actual: string;
  tone: "pos" | "neg" | "plain";
  warn?: boolean;
};

export type ScorecardVM = {
  abbr: string;
  /** True for a single calendar-month view (month / last_month / select_month) —
   *  the pace strip labels the goal "Monthly Goal"; otherwise "Period Goal". */
  isSingleMonth: boolean;
  /** True when any part of the view is the live in-progress month (not fully
   *  report-sourced) — the released figure is a provisional estimate that ties to
   *  the official Net Report when the month closes. */
  provisional: boolean;
  snapshot: {
    asOfDate: string;
    rangeLabel: string;
    daysElapsed: number;
    sellingDays: number;
    rawLeads: number | null;
    reconciled: boolean;
  };
  headline: {
    behind: boolean;
    tone: Tone;
    sentence: string;
    sub: string;
    pctOfPace: number;
  };
  pace: {
    behind: boolean;
    tone: Tone;
    verdict: string;
    pctOfPace: number;
    pctOfFull: number;
    elapsedPct: number;
    gap: number;
    netSales: number;
    paceGoal: number;
    monthlyGoal: number;
    avgSale: number;
    nsli: number;
    daysElapsed: number;
    sellingDays: number;
  };
  funnel: FunnelStage[];
  rates: {
    key: string;
    label: string;
    actual: number;
    target: number;
    higher: boolean;
    desc: string;
  }[];
  revenue: {
    buckets: RevenueBucket[];
    gross: number;
    workingRev: number;
    demoPct: number;
    trailingNSLI: number;
    identityOk: boolean;
    // Section ③ Sold-vs-Net figures. `net` = authoritative good business
    // (a.net_sales). On reconciled June-2026+ data it equals released+working+other
    // and gross − impliedCancelled; earlier months carry net but no bucket split,
    // surfaced as `unbucketed` with `bucketsComplete=false`.
    released: number;
    working: number;
    other: number;
    unbucketed: number;
    bucketsComplete: boolean;
    impliedCancelled: number;
    net: number;
    salesCount: number;
    cancelledCount: number;
  };
  perDay: { key: string; label: string; target: number; actual: number }[];
  status: { items: RankedItem[]; total: number; dropped: RankedItem[] };
  marketing: MarketingRow[];
};

const r0 = (v: number) => Math.round(v);

export function buildScorecardVM(view: ScorecardView, resolved: ResolvedPeriod): ScorecardVM {
  const { actuals: a, goals: g, derived: d } = view;
  const abbr = abbrFor(resolved.key);

  const daysElapsed = a.days_elapsed || 1;
  // Period-total selling days — expands with the filter (whole year for YTD, whole
  // quarter for QTD, the month for a single-month view). Falls back to the monthly
  // denominator on single-month / recompute paths that don't set it.
  const sellingDays = a.period_working_days ?? a.working_days_in_period ?? g.working_days ?? 26;

  // ── pace ──
  // Headline Net = RELEASED TO PRODUCTION (RTP) — the basis of Reece's official Net
  // Report. Released is a subset of "good business" (③ still shows the full
  // gross → good-business → released/working/other breakdown); the ① hero and pace
  // track released vs goal. Falls back to net_sales only if a row predates the
  // released split.
  const netReleased = a.released_dollars ?? a.net_sales ?? 0;
  const paceGoal = d.mtd_goal_dollars ?? 0;
  // Full goal for the whole period (Σ of the months in range) — NOT the current
  // month's goal alone. Equals the month goal for a single-month view.
  const monthlyGoal =
    d.period_goal_dollars ?? d.goal.effective_monthly_goal ?? d.monthly_goal_dollars ?? 0;
  const gap = Math.round(netReleased - paceGoal);
  const pctOfPace = paceGoal > 0 ? (netReleased / paceGoal) * 100 : 0;
  const pctOfFull = monthlyGoal > 0 ? Math.min(100, (netReleased / monthlyGoal) * 100) : 0;
  const elapsedPct = sellingDays > 0 ? Math.min(100, (daysElapsed / sellingDays) * 100) : 0;
  const behind = gap < 0;
  const tone: Tone = behind ? (pctOfPace < 75 ? "rose" : "amber") : "emerald";
  const verdict = behind ? (pctOfPace < 75 ? "Behind pace" : "Slightly behind") : "On / ahead of pace";

  // ── funnel ──
  const goalFor = (perDay: number | null): number | null =>
    perDay == null ? null : r0(perDay * daysElapsed);
  const set = a.sets ?? 0;
  const issued = a.issued ?? 0;
  const netIssue = a.net_issue ?? 0;
  const demos = a.demos ?? 0;
  const sold = a.sales ?? 0;
  const funnel: FunnelStage[] = [
    { key: "set", label: "Set", actual: set, goal: null, conv: null },
    {
      key: "issued",
      label: "Issued",
      actual: issued,
      goal: goalFor(d.target_issued_per_day),
      conv: set ? (issued / set) * 100 : 0,
      convLabel: "% Issue",
    },
    {
      key: "demos",
      label: "Demos",
      actual: demos,
      goal: goalFor(d.target_demoed_per_day),
      conv: netIssue ? (demos / netIssue) * 100 : 0,
      convLabel: "% Demo",
    },
    {
      key: "sold",
      label: "Sold",
      actual: sold,
      goal: goalFor(d.target_closed_per_day),
      conv: demos ? (sold / demos) * 100 : 0,
      convLabel: "% Close",
    },
  ];

  // ── rates ──
  const rates = [
    { key: "close", label: "Close %", actual: a.close_pct ?? 0, target: g.target_close_pct, higher: true, desc: "Sold ÷ demos" },
    { key: "demo", label: "Demo %", actual: a.demo_pct ?? 0, target: g.target_demo_pct, higher: true, desc: "Demos ÷ net issued" },
    { key: "goodRate", label: "Good Rate %", actual: a.good_rate_pct ?? 0, target: g.target_good_rate_pct, higher: true, desc: "Released ÷ sold $" },
    { key: "ko", label: "KO %", actual: a.ko_pct ?? 0, target: g.target_ko_pct, higher: false, desc: "Knocked-off jobs" },
  ];

  // ── revenue ──
  const bt = a.raw_inputs?.bucket_tally;
  const released = bt?.released_dollars ?? a.released_dollars ?? (a.net_sales ?? 0);
  const working = bt?.working_dollars ?? a.working_dollars ?? 0;
  const open = bt?.other_pending ?? 0;
  const gross = a.gross_sales ?? released + working + open;
  // Cancelled: from the tally, else the gross residual (never negative).
  const cancelled = bt?.cancelled_dollars ?? Math.max(0, gross - released - working - open);
  const buckets: RevenueBucket[] = [
    { key: "released", label: "Released (Net Sales)", value: released, tone: "navy" },
    { key: "working", label: "Working (held = Pending)", value: working, tone: "amber" },
    { key: "open", label: "Open quotes (pre-firm)", value: open, tone: "sky" },
    { key: "cancelled", label: "Cancelled", value: cancelled, tone: "slate" },
  ];
  const bucketSum = released + working + open + cancelled;
  // Net (Good Business) is the authoritative stored figure (= gross − cancellations).
  // The released/working/other split may be partial for pre-June-2026 months, so we
  // total ③ on `net` and surface any unbucketed remainder rather than a bucket sum.
  const net = a.net_sales ?? released + working + open;
  const bucketed = released + working + open;
  const unbucketed = Math.max(0, Math.round(net - bucketed));
  const impliedCancelled = Math.max(0, Math.round(gross - net));
  const revenue = {
    buckets,
    gross,
    workingRev: working + open,
    demoPct: a.demo_pct ?? 0,
    trailingNSLI: g.trailing_nsli ?? 0,
    identityOk: Math.abs(bucketSum - gross) <= 1,
    released,
    working,
    other: open,
    unbucketed,
    bucketsComplete: unbucketed <= 1,
    impliedCancelled,
    net,
    salesCount: sold,
    cancelledCount: a.ko_count ?? 0,
  };

  // ── per-day pace ──
  const perDay = [
    { key: "issued", label: "Issued / day", target: d.target_issued_per_day ?? 0, actual: d.actual_issued_per_day },
    { key: "demoed", label: "Demoed / day", target: d.target_demoed_per_day ?? 0, actual: d.actual_demoed_per_day },
    { key: "closed", label: "Closed / day", target: d.target_closed_per_day ?? 0, actual: d.actual_closed_per_day },
  ];

  // ── status tally ──
  const statusEntries = Object.entries(a.raw_inputs?.status_tally ?? {}).sort((x, y) => y[1] - x[1]);
  const status = {
    items: statusEntries.slice(0, 10).map(([label, count]) => ({ label, count })),
    total: statusEntries.length,
    dropped: Object.entries(a.raw_inputs?.non_demo_tally ?? {})
      .sort((x, y) => y[1] - x[1])
      .map(([label, count]) => ({ label, count })),
  };

  // ── headline copy ──
  const left = Math.max(0, sellingDays - daysElapsed);
  const sentence = behind
    ? `Behind plan — released net is ${scMoneyShort(Math.abs(gap))} under the ${abbr} goal.`
    : `On track — released net is ${scMoneyShort(gap)} ahead of the ${abbr} goal.`;
  const sub = `That's ${Math.round(pctOfPace)}% of where you should be by today, with ${left} selling day${left === 1 ? "" : "s"} left in the period.`;
  const headline = { behind, tone, sentence, sub, pctOfPace };

  // ── Marketing / Sales detail rows (the numbers behind the visuals) ──
  const marketing = buildMarketing(view, daysElapsed, sellingDays, abbr);

  const isSingleMonth =
    resolved.key === "month" || resolved.key === "last_month" || resolved.key === "select_month";

  return {
    abbr,
    isSingleMonth,
    provisional: a.computed_from !== "net_report_rtp",
    snapshot: {
      asOfDate: a.as_of_date,
      rangeLabel: `${a.period_start} → ${a.period_end}`,
      daysElapsed,
      sellingDays,
      rawLeads: a.raw_leads_in,
      reconciled: d.reconciled,
    },
    headline,
    pace: {
      behind,
      tone,
      verdict,
      pctOfPace,
      pctOfFull,
      elapsedPct,
      gap,
      netSales: netReleased, // headline Net = released to production (RTP)
      paceGoal,
      monthlyGoal,
      avgSale: a.avg_sale ?? 0,
      nsli: a.nsli ?? 0,
      daysElapsed,
      sellingDays,
    },
    funnel,
    rates,
    revenue,
    perDay,
    status,
    marketing,
  };
}

function buildMarketing(
  view: ScorecardView,
  daysElapsed: number,
  sellingDays: number,
  _abbr: string,
): MarketingRow[] {
  const { actuals: a, goals: g, derived: d } = view;
  const monthlyIssued = g.trailing_nsli > 0 ? g.monthly_goal_dollars / g.trailing_nsli : null;
  const monthlyDemos = monthlyIssued != null ? monthlyIssued * (g.target_demo_pct / 100) : null;
  const monthlySales = monthlyDemos != null ? monthlyDemos * (g.target_close_pct / 100) : null;
  const prorate = (v: number | null) => (v == null ? null : v * (daysElapsed / (sellingDays || 1)));
  const issuePct = g.target_issue_pct;
  const netClosePct = g.target_net_close_pct;
  const monthlySet = issuePct != null && issuePct > 0 && monthlyIssued != null ? monthlyIssued / (issuePct / 100) : null;
  const monthlyNetClose = netClosePct != null && monthlyDemos != null ? monthlyDemos * (netClosePct / 100) : null;

  const count = (v: number | null): string | null => (v == null ? null : num(r0(v)));
  const open = a.raw_inputs?.bucket_tally?.other_pending ?? null;

  const toneCount = (actual: number, goal: number | null): "pos" | "neg" | "plain" =>
    goal == null ? "plain" : actual >= goal ? "pos" : "neg";
  const tonePct = (actual: number | null, target: number): "pos" | "neg" | "plain" =>
    actual == null ? "plain" : actual >= target ? "pos" : "neg";

  return [
    { metric: "Set", monthGoal: count(monthlySet), mtdGoal: count(prorate(monthlySet)), actual: num(a.sets), tone: "plain" },
    { metric: "Issued", monthGoal: count(monthlyIssued), mtdGoal: count(prorate(monthlyIssued)), actual: num(a.issued), tone: toneCount(a.issued, prorate(monthlyIssued)) },
    { metric: "Net Issue", monthGoal: null, mtdGoal: null, actual: num(a.net_issue), tone: "plain", warn: true },
    { metric: "% Issue", monthGoal: issuePct != null ? pct(issuePct) : null, mtdGoal: issuePct != null ? pct(issuePct) : null, actual: pct(a.pct_issue), tone: "plain" },
    { metric: "Demos", monthGoal: count(monthlyDemos), mtdGoal: count(prorate(monthlyDemos)), actual: num(a.demos), tone: toneCount(a.demos, prorate(monthlyDemos)) },
    { metric: "% Demo", monthGoal: pct(g.target_demo_pct), mtdGoal: pct(g.target_demo_pct), actual: pct(a.demo_pct), tone: tonePct(a.demo_pct, g.target_demo_pct) },
    { metric: "Sold", monthGoal: count(monthlySales), mtdGoal: count(prorate(monthlySales)), actual: num(a.sales), tone: toneCount(a.sales, prorate(monthlySales)) },
    { metric: "% Gross Close", monthGoal: pct(g.target_close_pct), mtdGoal: pct(g.target_close_pct), actual: pct(a.close_pct), tone: tonePct(a.close_pct, g.target_close_pct) },
    { metric: "# Net Close", monthGoal: count(monthlyNetClose), mtdGoal: count(prorate(monthlyNetClose)), actual: num(a.net_close), tone: "plain", warn: true },
    { metric: "% Net Close", monthGoal: netClosePct != null ? pct(netClosePct) : null, mtdGoal: netClosePct != null ? pct(netClosePct) : null, actual: pct(a.pct_net_close), tone: "plain", warn: true },
    { metric: "Gross Sale $", monthGoal: null, mtdGoal: null, actual: usd(a.gross_sales), tone: "plain" },
    { metric: "Net Sales (Released)", monthGoal: usd(d.goal.effective_monthly_goal), mtdGoal: usd(d.mtd_goal_dollars), actual: usd(a.net_sales), tone: a.net_sales >= d.mtd_goal_dollars ? "pos" : "neg", warn: true },
    { metric: "Working Revenue", monthGoal: null, mtdGoal: null, actual: usd(a.working_dollars), tone: "plain", warn: true },
    { metric: "Open Quotes", monthGoal: null, mtdGoal: null, actual: usd(open), tone: "plain", warn: true },
    { metric: "GSLI", monthGoal: null, mtdGoal: null, actual: usd(a.gsli), tone: "plain" },
    { metric: "NSLI", monthGoal: g.trailing_nsli ? usd(g.trailing_nsli) : null, mtdGoal: g.trailing_nsli ? usd(g.trailing_nsli) : null, actual: usd(a.nsli), tone: "plain", warn: true },
  ];
}
