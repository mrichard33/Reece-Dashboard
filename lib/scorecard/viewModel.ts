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
import { prorateGoal } from "@/lib/scorecard/paceTargets";
import type { FunnelStage } from "@/components/scorecard/viz/Funnel";
import type { RevenueBucket } from "@/components/scorecard/viz/RevenueStack";
import type { RankedItem } from "@/components/scorecard/viz/RankedBars";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import type { ReportFacts } from "@/lib/queries/reportFacts.core";

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
    /** True when no report-sourced net exists for the period yet — the Net /
     *  Projected / Balance tiles render "—" instead of a fabricated $0. */
    netPending: boolean;
    paceGoal: number;
    monthlyGoal: number;
    avgSale: number;
    nsli: number;
    /** Trailing window that produced NSLI + avg sale, and its sales-count sample —
     *  for the "how was this computed" tooltip. */
    rateWindow: string | null;
    /** True when the rates fell back to a WIDER window than the primary
     *  (rolling-90d / trailing-3) because the sample was too thin — rendered
     *  as a visible flag, never a silent substitution (ruled 2026-08-04). */
    rateWidened: boolean;
    rateSampleN: number | null;
    /** Historical issue rate (issued ÷ leads, 0–1) from the same window — drives
     *  the derived Leads goal; surfaced on the NSLI tile. Null = no leads history. */
    issueRate: number | null;
    /** Period-scoped rate anchor (first-of-month the window ends before). */
    rateAnchorMonth: string | null;
    ratePeriodScoped: boolean;
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
    /** True when NO net source exists for the period (net_sales AND
     *  released_dollars null, no bucket tally) — no report has landed yet.
     *  Pending is NOT zero (writer invariant): `net`/`impliedCancelled` are
     *  null and must render "—", never $0 / gross-minus-zero artifacts
     *  ("2 cancellations = gross sold", 2026-08-04). */
    reportPending: boolean;
    impliedCancelled: number | null;
    net: number | null;
    salesCount: number;
    cancelledCount: number;
    /**
     * Report-facts figures for the ③ cards (lp_report_facts, CSV-era sources).
     * All `number | null`: null = "not yet sourced" and renders "—", NEVER $0.
     * The old `impliedCancelled` residual (gross − net) is NOT a cancellation
     * figure — when net_sales was 0 it equaled gross and collapsed surviving
     * business to $0 (the 2026-08-05 defect). The card now renders cancels
     * ONLY from these fields.
     */
    facts: {
      /** null when no facts snapshot covers the resolved period */
      soldBasis: "sales_efficiency" | "control_totals" | "lead_attributed" | null;
      soldAsOf: string | null;
      /** Scope of the snapshot that answered — "mtd" / "ytd" / … */
      soldScope: "mtd" | "ytd" | "month" | "custom" | null;
      soldCount: number | null;
      grossSold: number | null;
      cancelCount: number | null;
      cancelValue: number | null;
      netAfterCancels: number | null;
      /** Why netAfterCancels is null despite a covering snapshot (cohort). */
      netPendingReason: string | null;
      /** open-pipeline stock (job_status_ytd) — null when never imported */
      pendingAsOf: string | null;
      pendingHoa: { count: number; dollars: number } | null;
      pendingPermit: { count: number; dollars: number } | null;
      pendingOther: { count: number; dollars: number } | null;
      pendingTotal: number | null;
      /** net after cancels − pending total; needs both sides sourced */
      releasedRemaining: number | null;
    };
  };
  /** Null target/actual = not computable ("—"): no NSLI history, or 0 completed
   *  selling days (first of the month). Never NaN/Infinity. */
  perDay: { key: string; label: string; target: number | null; actual: number | null }[];
  status: { items: RankedItem[]; total: number; dropped: RankedItem[] };
  marketing: MarketingRow[];
};

const r0 = (v: number) => Math.round(v);

export function buildScorecardVM(
  view: ScorecardView,
  resolved: ResolvedPeriod,
  reportFacts?: ReportFacts | null,
): ScorecardVM {
  const { actuals: a, goals: g, derived: d } = view;
  const abbr = abbrFor(resolved.key);

  // Elapsed COMPLETED selling days — 0 on the first day of a period ("no completed
  // days yet"); never coerced to 1, so pace math can render "—" instead of lying.
  const daysElapsed = a.days_elapsed ?? 0;
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
  // Pending (both null — no report yet): pace math runs on 0 for layout, but the
  // hero tiles render "—" via `netPending` instead of a fabricated $0-behind-goal.
  const netPending = a.released_dollars == null && a.net_sales == null;
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
  const behind = !netPending && gap < 0;
  const tone: Tone = netPending ? "amber" : behind ? (pctOfPace < 75 ? "rose" : "amber") : "emerald";
  const verdict = netPending
    ? "Report pending"
    : behind
      ? (pctOfPace < 75 ? "Behind pace" : "Slightly behind")
      : "On / ahead of pace";

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
    { key: "goodRate", label: "Good Rate %", actual: a.good_rate_pct ?? 0, target: g.target_good_rate_pct, higher: true, desc: "(Sold − cancelled) ÷ sold $" },
    { key: "ko", label: "KO %", actual: a.ko_pct ?? 0, target: g.target_ko_pct, higher: false, desc: "Knocked-off jobs" },
  ];

  // ── revenue ──
  const bt = a.raw_inputs?.bucket_tally;
  // No net source at all (no report has ever landed for this period): pending,
  // NOT zero — the writer stores NULL precisely so this state is distinguishable.
  // Coercing it to 0 fabricated "cancellations = entire gross" (2026-08-04).
  const reportPending = a.net_sales == null && a.released_dollars == null && bt == null;
  const released = bt?.released_dollars ?? a.released_dollars ?? (a.net_sales ?? 0);
  const working = bt?.working_dollars ?? a.working_dollars ?? 0;
  const open = bt?.other_pending ?? 0;
  const gross = a.gross_sales ?? released + working + open;
  // Cancelled: from the tally, else the gross residual (never negative) — but
  // never a residual against a PENDING (null) net.
  const cancelled = bt?.cancelled_dollars ?? (reportPending ? 0 : Math.max(0, gross - released - working - open));
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
  // Pending period (no report yet) → net/impliedCancelled are NULL, rendered "—".
  const net = reportPending ? null : (a.net_sales ?? released + working + open);
  const bucketed = released + working + open;
  const unbucketed = net == null ? 0 : Math.max(0, Math.round(net - bucketed));
  const impliedCancelled = net == null ? null : Math.max(0, Math.round(gross - net));
  // ③ card figures from lp_report_facts. Sold figures are period-gated (a YTD
  // snapshot never answers an MTD view); pending buckets are the current
  // open-pipeline stock. Missing → null → "—", never $0.
  const sf = reportFacts?.sold ?? null;
  const gb = reportFacts?.goodBusiness ?? null;
  const facts = {
    soldBasis: sf?.basis ?? null,
    soldAsOf: sf?.asOf ?? null,
    soldScope: sf?.scope ?? null,
    soldCount: sf?.soldCount ?? null,
    grossSold: sf?.grossSoldDollars ?? null,
    cancelCount: sf?.cancelCount ?? null,
    cancelValue: sf?.cancelValueDollars ?? null,
    netAfterCancels: sf?.netAfterCancelsDollars ?? null,
    netPendingReason: sf?.netPendingReason ?? null,
    pendingAsOf: gb?.asOf ?? null,
    pendingHoa: gb?.hoa ?? null,
    pendingPermit: gb?.permit ?? null,
    pendingOther: gb?.otherPending ?? null,
    pendingTotal: gb?.pendingTotalDollars ?? null,
    // Both sides must be sourced — a cohort-immature net makes the remainder
    // unknowable, not zero.
    releasedRemaining:
      sf?.netAfterCancelsDollars != null && gb != null
        ? sf.netAfterCancelsDollars - gb.pendingTotalDollars
        : null,
  };
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
    reportPending,
    impliedCancelled,
    net,
    salesCount: sold,
    cancelledCount: a.ko_count ?? 0,
    facts,
  };

  // ── per-day pace ──
  const perDay = [
    { key: "issued", label: "Issued / day", target: d.target_issued_per_day, actual: d.actual_issued_per_day },
    { key: "demoed", label: "Demoed / day", target: d.target_demoed_per_day, actual: d.actual_demoed_per_day },
    { key: "closed", label: "Closed / day", target: d.target_closed_per_day, actual: d.actual_closed_per_day },
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
  const sentence = netPending
    ? `No report-sourced net for this period yet — released figures fill in after the first successful report ingest.`
    : behind
      ? `Behind plan — released net is ${scMoneyShort(Math.abs(gap))} under the ${abbr} goal.`
      : `On track — released net is ${scMoneyShort(gap)} ahead of the ${abbr} goal.`;
  const sub = netPending
    ? `${left} selling day${left === 1 ? "" : "s"} left in the period.`
    : `That's ${Math.round(pctOfPace)}% of where you should be by today, with ${left} selling day${left === 1 ? "" : "s"} left in the period.`;
  const headline = { behind, tone, sentence, sub, pctOfPace };

  // ── Marketing / Sales detail rows (the numbers behind the visuals) ──
  const marketing = buildMarketing(view, daysElapsed, sellingDays);

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
      netPending,
      paceGoal,
      monthlyGoal,
      // NSLI and Average Sale are the CALCULATED trailing rates (previous running
      // data — net ÷ leads issued and net ÷ sales over the trailing window), NOT the
      // volatile current partial-month actuals. Same values that drive the targets.
      avgSale: d.avg_sale_target ?? 0,
      nsli: g.trailing_nsli ?? 0,
      rateWindow: d.rate_window,
      rateWidened: d.rate_window != null && d.rate_window !== "rolling_90d" && d.rate_window !== "trailing_3",
      rateSampleN: d.rate_sample_n,
      issueRate: d.issue_rate,
      rateAnchorMonth: d.rate_anchor_month,
      ratePeriodScoped: d.rate_period_scoped,
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
): MarketingRow[] {
  const { actuals: a, goals: g, derived: d } = view;
  // Target lead funnel (one direction from the NET goal): issued = goal ÷ NSLI →
  // demos = issued × demo% → sales = goal ÷ NET average sale (NOT demos × close%,
  // so the sales target can't drift off the dollar goal).
  const nsliRate = g.trailing_nsli ?? 0;
  const monthlyIssued = nsliRate > 0 ? g.monthly_goal_dollars / nsliRate : null;
  const monthlyDemos = monthlyIssued != null ? monthlyIssued * (g.target_demo_pct / 100) : null;
  const monthlySales =
    d.avg_sale_target && d.avg_sale_target > 0 ? g.monthly_goal_dollars / d.avg_sale_target : null;
  const prorate = (v: number | null) => prorateGoal(v, daysElapsed, sellingDays);
  // Ruled 2026-08-04: issue % is DERIVED from history, never a hand-set target.
  // The stored target_issue_pct column is unused — no read path consults it, so
  // the Set / % Issue target cells render "—" rather than a configured number.
  const issuePct: number | null = null;
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
    { metric: "Net Sales (Released)", monthGoal: usd(d.goal.effective_monthly_goal), mtdGoal: usd(d.mtd_goal_dollars), actual: a.net_sales == null ? "—" : usd(a.net_sales), tone: a.net_sales == null ? "plain" : a.net_sales >= d.mtd_goal_dollars ? "pos" : "neg", warn: true },
    { metric: "Working Revenue", monthGoal: null, mtdGoal: null, actual: usd(a.working_dollars), tone: "plain", warn: true },
    { metric: "Open Quotes", monthGoal: null, mtdGoal: null, actual: usd(open), tone: "plain", warn: true },
    { metric: "GSLI", monthGoal: null, mtdGoal: null, actual: usd(a.gsli), tone: "plain" },
    { metric: "NSLI", monthGoal: g.trailing_nsli ? usd(g.trailing_nsli) : null, mtdGoal: g.trailing_nsli ? usd(g.trailing_nsli) : null, actual: usd(a.nsli), tone: "plain", warn: true },
  ];
}
