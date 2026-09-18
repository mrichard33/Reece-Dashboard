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
import { METRIC_LABELS, METRIC_FORMULAS } from "@/lib/scorecard/labels";
import type { FunnelStage } from "@/components/scorecard/viz/Funnel";
import type { RevenueBucket } from "@/components/scorecard/viz/RevenueStack";
import type { RankedItem } from "@/components/scorecard/viz/RankedBars";
import type { ScorecardView } from "@/lib/queries/scorecard";
import type { ResolvedPeriod } from "@/lib/date/resolvePeriod";
import { sellingDaysElapsed, type SellingCalendar } from "@/lib/date/sellingDays";
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
   *  report 137's re-observation of the cohort as it matures. */
  provisional: boolean;
  snapshot: {
    asOfDate: string;
    rangeLabel: string;
    /** Selling days elapsed by the CALENDAR — independent of how fresh the feed is. */
    daysElapsed: number;
    /** Selling days the ACTUALS cover, per the snapshot. Below daysElapsed when stale. */
    dataDaysElapsed: number | null;
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
    /** goal ÷ issued needed — the NSLI the targets use. × issuedNeeded = goal. */
    planningNsli: number | null;
    /** goal ÷ sales needed. */
    planningAvgSale: number | null;
    /** Unrounded full-period issued target (Σ office chains). ONE issued target. */
    issuedNeeded: number | null;
    /** Goal $ covered by a computable issued chain. */
    planningIssuedGoal: number | null;
    /** Trailing window that produced NSLI + avg sale, and its sales-count sample —
     *  for the "how was this computed" tooltip. */
    rateWindow: string | null;
    /** True when the rates fell back to a WIDER window than the primary
     *  (rolling-90d / trailing-3) because the sample was too thin — rendered
     *  as a visible flag, never a silent substitution (ruled 2026-08-04). */
    rateWidened: boolean;
    rateSampleN: number | null;
    /** Period-scoped rate anchor (first-of-month the window ends before). */
    rateAnchorMonth: string | null;
    ratePeriodScoped: boolean;
    daysElapsed: number;
    /** Elapsed through the CALENDAR cutoff, when that differs from `daysElapsed`
     *  because the goal-bearing feed is behind. Shown beside it so a reader can
     *  see the day the pace math is NOT counting rather than losing it. */
    calendarDaysElapsed: number;
    sellingDays: number;
    /** Coverage date of the RTP export behind `netSales` and `paceGoal` — the
     *  date the REVENUE reaches, which is not `snapshot.asOfDate` (what the
     *  counts reach). Null when no report has landed. The hero states it so a
     *  reader can see the two figures share one date. */
    revenueAsOf: string | null;
    /** Selling days elapsed through `revenueAsOf` — the denominator `paceGoal`
     *  was prorated over, shown beside the count elapsed so the two are
     *  distinguishable rather than silently different. */
    revenueDaysElapsed: number | null;
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
      /** gross − cancelled ONLY. Not net, not NSA — see SoldFacts. */
      /** Reece Net Sales = gross − cancellations − financing denied (§6). Ties
       *  to lp_cohort_maturation.net_sales_cents, so the Sold card, the hero and
       *  ⑤ By Market all render ONE Net Sales from one definition. */
      netSales: number | null;
      /** Working + Hold — sold, unreleased, NOT lost. The whole gap between Net
       *  Sales and LP's NSA. */
      notYetReleased: number | null;
      /** LP's NSA — the only figure on this card that may be called Net/NSA. */
      netAfterCancels: number | null;
      /** Why netAfterCancels is null despite a covering snapshot (cohort). */
      netPendingReason: string | null;
      /**
       * Net RELEASED from report 134 itself. Null = no covering 134 snapshot,
       * in which case the panel falls back to the live sync table AND SAYS SO.
       * This panel used to claim report-134 provenance while reading that
       * table, which on 2026-08-10 was four days stale.
       */
      releasedBasis: "jobs_by_milestone" | null;
      releasedAsOf: string | null;
      releasedScope: "mtd" | "ytd" | "month" | "custom" | null;
      releasedJobCount: number | null;
      netReleased: number | null;
      /**
       * Terminal cohort from report 133 — the source for cancellations that
       * `lp_market_scorecard_daily` never had (it carries only ko_count).
       * Kept out of the pending totals, which mean open pipeline.
       */
      lostCount: number | null;
      lostDollars: number | null;
      /**
       * Report 133's lost cohort split by CAUSE. Null = no covering 133
       * snapshot. Never sourced from `ko_count`, which is a different measure
       * on a different cohort and disagrees by design.
       */
      lostBasis: "job_status_ytd" | null;
      lostAsOf: string | null;
      lostTotalCount: number | null;
      lostTotalDollars: number | null;
      lostByCause: { key: string; label: string; count: number; dollars: number }[];
      lostUnresolvedCount: number;
      lostUnresolvedDollars: number;
      /** open-pipeline stock (job_status_ytd) — null when never imported */
      pendingAsOf: string | null;
      pendingHoa: { count: number; dollars: number } | null;
      pendingPermit: { count: number; dollars: number } | null;
      pendingOther: { count: number; dollars: number } | null;
      pendingTotal: number | null;
      pendingCount: number | null;
      /**
       * Leads — report 135 (lead_disposition) and ONLY 135, summed over the
       * market's branch-grain rows. Null = not sourced → "—", never 0. This
       * replaces `raw_leads_in`, which is NULL for every market and rendered a
       * confident 0 leads per office (§4).
       *
       * ⚠️ DISTINCT leads since Amendment E7 (2026-08-15), not the raw row
       * count — 135 is emitted at lead × disposition-state grain, so a row count
       * overstates leads by ~7%. This is the figure the Leads TARGET is measured
       * against, and the target's denominator resolves from the same
       * `LeadsFacts.leads` expression, which is what keeps actual and target in
       * one unit. The row count is `LeadsFacts.leadRows` and renders as the
       * By Market sub-line.
       */
      leads: number | null;
      leadsAsOf: string | null;
      /** Report 136's company control total — shown alongside, never instead. */
      leadsRecon: number | null;
      /** 135 − 136 on the ROW basis both sides share; |delta| ≤ 4 is report
       *  135's validation gate (§5). Not re-based to distinct: 136 publishes no
       *  distinct count, so that comparison would be between two different
       *  things. */
      leadsReconDelta: number | null;
    };
  };
  /** Null target/actual = not computable ("—"): no NSLI history, or 0 completed
   *  selling days (first of the month). Never NaN/Infinity. */
  perDay: { key: string; label: string; target: number | null; actual: number | null }[];
  status: { items: RankedItem[]; total: number; dropped: RankedItem[] };
  marketing: MarketingRow[];
};

const r0 = (v: number) => Math.round(v);

const usdCents = (v: number): string =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildScorecardVM(
  view: ScorecardView,
  resolved: ResolvedPeriod,
  reportFacts?: ReportFacts | null,
  cal?: SellingCalendar,
  /**
   * Elapsed selling days from the reporting clock — see
   * lib/scorecard/reportingClock.ts.
   *
   * ⚠️ RULING 2026-08-13, and it REVERSES the comment directly below. The block
   * beginning "This is a CALENDAR fact" argues that elapsed must never come from
   * the data, because a stalled feed would shrink the target in step with the
   * missing actuals and a real miss would render as on-pace. That reasoning was
   * right for the world it was written in, where a stall was invisible.
   *
   * It is no longer, and the misalignment it accepted has its own cost: on
   * 2026-08-12 a Net Sales numerator covering 8 selling days was measured
   * against a target prorated over 9, which is not conservatism, it is two
   * different periods in one ratio. The page now derives elapsed from the
   * goal-bearing source's OWN coverage date so numerator and denominator always
   * describe the same days, and surfaces the lag explicitly on the tile — the
   * badge does the stall-detection job that misalignment was standing in for.
   *
   * Be clear-eyed about the direction: this makes a late feed look BETTER
   * ($423,553 on Balance, $669,117 on Projected Pace). That is only acceptable
   * because the lag is now rendered beside the number rather than inferred from
   * it. If the badge is ever removed, this parameter must go with it.
   *
   * Omitted → the calendar anchor, exactly as before.
   */
  clockElapsedDays?: number | null,
): ScorecardVM {
  const { actuals: a, goals: g, derived: d } = view;
  const abbr = abbrFor(resolved.key);

  // Elapsed COMPLETED selling days — 0 on the first day of a period ("no completed
  // days yet"); never coerced to 1, so pace math can render "—" instead of lying.
  //
  // This is a CALENDAR fact and must not come from the data. `a.days_elapsed` is
  // written by the LP-MCP daily job and anchored to that snapshot's as_of_date, so
  // a stalled feed freezes it: on 2026-08-11 the tile read "6 of 26" because the
  // snapshot had not advanced past 2026-08-07, while eight selling days had
  // actually elapsed. Every target-to-date is prorated over this number, so a
  // stale feed shrinks the target in step with the missing actuals and a real
  // miss renders as on-pace. The feed going quiet must make the page look WORSE,
  // not better.
  //
  // resolved.asOf is previousCalendarDay(today) for the MTD key — derived from
  // the calendar, never from the feed — so counting to it is immune. `today
  // never counts` is already true by construction: asOf is yesterday. A Sunday
  // asOf adds nothing here — sellingDaysElapsed skips non-selling days — so
  // coverage reaching through the bonus day never inflates the pace basis.
  const calendarElapsed = cal
    ? sellingDaysElapsed(resolved.periodStart, resolved.asOf, cal)
    : null;
  const daysElapsed = clockElapsedDays ?? calendarElapsed ?? a.days_elapsed ?? 0;
  /**
   * Elapsed through the CALENDAR cutoff, kept alongside so a tile can show both
   * and name the gap. Without this the page would silently drop a whole selling
   * day from view whenever a feed lagged.
   */
  const calendarDaysElapsed = calendarElapsed ?? daysElapsed;
  /** How far the ACTUALS reach — the snapshot's own count. Only for showing age. */
  const dataDaysElapsed = a.days_elapsed ?? null;
  // Period-total selling days — expands with the filter (whole year for YTD, whole
  // quarter for QTD, the month for a single-month view).
  //
  // No numeric fallback: a missing denominator used to become 26, which is a
  // plausible-looking month and therefore silently wrong for Feb (24), Nov (23)
  // or any period that is not a single month. 0 propagates to the `sellingDays > 0`
  // guards below and renders "—".
  const sellingDays = a.period_working_days ?? a.working_days_in_period ?? g.working_days ?? 0;

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
  // THE REVENUE TARGET, not the count target. `netReleased` reaches
  // `a.revenue_as_of` (report 134's RTP coverage date); `d.mtd_goal_dollars`
  // reaches the period's own as-of, which is later whenever a report has not
  // landed for the most recent days. Dividing one by the other understates every
  // market every day — on 2026-08-11 revenue settled through Aug 6 was measured
  // against a target prorated to Aug 10, and Fort Lauderdale read 5% of target.
  // Both sides of this ratio now reach the same date. See docs/revenue-as-of.md.
  const paceGoal = d.revenue_goal_to_date_dollars ?? d.mtd_goal_dollars ?? 0;
  /** The date the revenue figures reach — null when no RTP export has landed. */
  const revenueAsOf = a.revenue_as_of ?? null;
  /** Selling days elapsed through `revenueAsOf`; the denominator behind paceGoal. */
  const revenueDaysElapsed =
    cal && revenueAsOf ? sellingDaysElapsed(resolved.periodStart, revenueAsOf, cal) : null;
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
  // Target to date from the UNROUNDED period total (ruling 2026-09-18),
  // never rounded per-day × days.
  const goalFor = (total: number | null): number | null => {
    const v = prorateGoal(total, daysElapsed, sellingDays);
    return v == null ? null : r0(v);
  };
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
      goal: goalFor(d.target_issued_total),
      conv: set ? (issued / set) * 100 : 0,
      convLabel: "% Issue",
    },
    {
      key: "demos",
      label: "Demos",
      actual: demos,
      goal: goalFor(d.target_demoed_total),
      conv: netIssue ? (demos / netIssue) * 100 : 0,
      convLabel: "% Demo",
    },
    {
      key: "sold",
      label: "Sold",
      actual: sold,
      goal: goalFor(d.target_closed_total),
      conv: demos ? (sold / demos) * 100 : 0,
      convLabel: "% Close",
    },
  ];

  // ── rates ──
  const rates = [
    // ⚠️ `close_pct` is `sold ÷ demos` and its LABEL is "Demo → Sale %".
    // "Close %" is RESERVED for `sales ÷ issued appointments`, which nothing
    // computes yet — see lib/scorecard/labels.ts. The column name stays
    // `close_pct` (the writer emits it, and renaming it is a migration); what
    // changes is that the screen stops calling it something it isn't.
    // Target = the rate the targets imply (sales needed ÷ demos needed), so
    // demos goal × this = sales goal (ruling 2026-09-18). The stored target is
    // the fallback only when no chain is computable.
    { key: "demoToSale", label: METRIC_LABELS.demoToSale, actual: a.close_pct ?? 0, target: d.planning_demo_to_sale_pct ?? g.target_close_pct, higher: true, desc: METRIC_FORMULAS.demoToSale },
    { key: "demo", label: METRIC_LABELS.demo, actual: a.demo_pct ?? 0, target: g.target_demo_pct, higher: true, desc: "Demos ÷ net issued" },
    // ⚠️ Good Rate % and KO % REMOVED (Amendment B3). Neither is in the v4 or
    // Amendment A metric set, and each duplicates a contracted 137 metric with
    // a term dropped: Good Rate % is Net Retention % without Financing Denied,
    // KO % is the cancellation half of Permanent Loss %. Deleted here rather
    // than left unrendered, per B3 — a dead path is how a retired metric comes
    // back. If either is wanted for continuity it belongs in its own
    // diagnostic panel with its cohort basis stated, not in this list.
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
  const lf = reportFacts?.leads ?? null;
  // Report 134's own net released. The daily-table `released` above stays as the
  // bucket-stack input (the released/working/open identity is computed on that
  // basis and must stay internally consistent); this is the figure the
  // "Released this period" panel shows, because that panel already claimed
  // report-134 provenance while reading the stale daily table.
  const rf = reportFacts?.released ?? null;
  const lostF = reportFacts?.lost ?? null;
  const facts = {
    soldBasis: sf?.basis ?? null,
    soldAsOf: sf?.asOf ?? null,
    soldScope: sf?.scope ?? null,
    soldCount: sf?.soldCount ?? null,
    grossSold: sf?.grossSoldDollars ?? null,
    cancelCount: sf?.cancelCount ?? null,
    cancelValue: sf?.cancelValueDollars ?? null,
    netSales: sf?.netSalesDollars ?? null,
    notYetReleased: sf?.notYetReleasedDollars ?? null,
    netAfterCancels: sf?.netAfterCancelsDollars ?? null,
    netPendingReason: sf?.netPendingReason ?? null,
    releasedBasis: rf?.basis ?? null,
    releasedAsOf: rf?.asOf ?? null,
    releasedScope: rf?.scope ?? null,
    releasedJobCount: rf?.jobCount ?? null,
    netReleased: rf?.netReleasedDollars ?? null,
    lostCount: gb?.lost?.count ?? null,
    lostDollars: gb?.lost?.dollars ?? null,
    lostBasis: lostF?.basis ?? null,
    lostAsOf: lostF?.asOf ?? null,
    lostTotalCount: lostF?.totalCount ?? null,
    lostTotalDollars: lostF?.totalDollars ?? null,
    lostByCause: lostF?.byCause ?? [],
    lostUnresolvedCount: lostF?.unresolvedCount ?? 0,
    lostUnresolvedDollars: lostF?.unresolvedDollars ?? 0,
    pendingAsOf: gb?.asOf ?? null,
    pendingHoa: gb?.hoa ?? null,
    pendingPermit: gb?.permit ?? null,
    pendingOther: gb?.otherPending ?? null,
    pendingTotal: gb?.pendingTotalDollars ?? null,
    pendingCount: gb?.pendingTotalCount ?? null,
    leads: lf?.leads ?? null,
    leadsAsOf: lf?.asOf ?? null,
    leadsRecon: lf?.reconLeads ?? null,
    leadsReconDelta: lf?.reconDelta ?? null,
    // §2: `releasedRemaining` (net after cancels − pending total) IS DELETED,
    // not moved. It subtracted a POINT-IN-TIME STOCK from a PERIOD FLOW: the
    // holds come from the Job Status report and include jobs sold in prior
    // periods — prior YEARS — while net-sold is this period's sold-date
    // activity. In the 3-Month view it took YTD-wide holds off three months of
    // sales; in MTD, off two days. The result was not a smaller number, it was
    // a number that meant nothing, and it is why "Remaining net (released)"
    // rendered blank in MTD and 3-Month — the operation could not resolve.
    //
    // The three panels now declare their own basis in their headers and no
    // arithmetic crosses between them.
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
      dataDaysElapsed,
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
      planningNsli: d.planning_nsli,
      planningAvgSale: d.planning_avg_sale,
      issuedNeeded: d.target_issued_total,
      planningIssuedGoal: d.planning_issued_goal_dollars,
      rateWindow: d.rate_window,
      rateWidened: d.rate_window != null && d.rate_window !== "rolling_90d" && d.rate_window !== "trailing_3",
      rateSampleN: d.rate_sample_n,
      rateAnchorMonth: d.rate_anchor_month,
      ratePeriodScoped: d.rate_period_scoped,
      daysElapsed,
      calendarDaysElapsed,
      sellingDays,
      revenueAsOf,
      revenueDaysElapsed,
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
  // RULING 2026-09-18: the SAME Σ-office totals every other section uses —
  // never company goal ÷ blended NSLI, which produced a third set of targets.
  const monthlyIssued = d.target_issued_total;
  const monthlyDemos = d.target_demoed_total;
  const monthlySales = d.target_closed_total;
  const closeTarget = d.planning_demo_to_sale_pct ?? g.target_close_pct;
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
    { metric: "% Gross Close", monthGoal: pct(closeTarget), mtdGoal: pct(closeTarget), actual: pct(a.close_pct), tone: tonePct(a.close_pct, closeTarget) },
    { metric: "# Net Close", monthGoal: count(monthlyNetClose), mtdGoal: count(prorate(monthlyNetClose)), actual: num(a.net_close), tone: "plain", warn: true },
    { metric: "% Net Close", monthGoal: netClosePct != null ? pct(netClosePct) : null, mtdGoal: netClosePct != null ? pct(netClosePct) : null, actual: pct(a.pct_net_close), tone: "plain", warn: true },
    { metric: "Gross Sale $", monthGoal: null, mtdGoal: null, actual: usd(a.gross_sales), tone: "plain" },
    { metric: "Net Sales (Released)", monthGoal: usd(d.goal.effective_monthly_goal), mtdGoal: usd(d.mtd_goal_dollars), actual: a.net_sales == null ? "—" : usd(a.net_sales), tone: a.net_sales == null ? "plain" : a.net_sales >= d.mtd_goal_dollars ? "pos" : "neg", warn: true },
    { metric: "Working Revenue", monthGoal: null, mtdGoal: null, actual: usd(a.working_dollars), tone: "plain", warn: true },
    { metric: "Open Quotes", monthGoal: null, mtdGoal: null, actual: usd(open), tone: "plain", warn: true },
    { metric: "GSLI", monthGoal: null, mtdGoal: null, actual: usd(a.gsli), tone: "plain" },
    // Planning NSLI with cents so it × the issued goal = the goal exactly.
    { metric: "NSLI", monthGoal: d.planning_nsli ? usdCents(d.planning_nsli) : null, mtdGoal: d.planning_nsli ? usdCents(d.planning_nsli) : null, actual: usd(a.nsli), tone: "plain", warn: true },
  ];
}
