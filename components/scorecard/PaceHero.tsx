import { num, usd, usDate, shortDate } from "@/lib/utils";
import { ScSection } from "./ScSection";
import type { ScorecardVM } from "@/lib/scorecard/viewModel";
import { prorateGoal } from "@/lib/scorecard/paceTargets";
import { METRIC_LABELS } from "@/lib/scorecard/labels";

/**
 * Section ① — Goal & Pace. The 5-second read: a flat horizontal band of eight
 * KPIs (no gauge). Projected Pace and Balance are colored vs the monthly goal.
 */

type Kpi = { label: string; sub: string; value: string; tone?: "pos" | "neg" | "plain"; title?: string; flag?: boolean };

/** Planning rates show cents so they multiply back to the goal exactly
 *  (3,189 × $3,715.35 = $11,848,251). Whole-dollar display dropped ~$1,116. */
const usdCents = (v: number): string =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

export function PaceHero({
  vm,
  netSalesDollars = null,
  netSalesAsOf = null,
  netSalesLag = null,
  netSalesRefused = null,
  periodAvgSaleDollars = 0,
  periodSalesCount = 0,
  cohortIssued = null,
}: {
  vm: ScorecardVM;
  /**
   * Net Sales for the period — Gross Written − Cancellations − Financing
   * Denied, from the cohort layer. THE GOAL-BEARING BASIS (2026-08-12), and the
   * ONLY figure this hero will show as the actual.
   *
   * Projected Pace and Balance are derived from it here rather than read off
   * `vm.pace`, so the goal, the actual, the pace and the target-to-date cannot
   * end up on two sales-dollar bases.
   *
   * ⚠️ NULL RENDERS "UNAVAILABLE", NOT A SUBSTITUTE FIGURE. There used to be an
   * RTP fallback here. It is gone deliberately: RTP is a different economic
   * event — released to production, dated by production milestone — and putting
   * it in the most important position on a SALES scorecard misreports the
   * month even when it is labelled. A reader who wants it has the Released
   * panel below, where nothing is paced against it. An honest blank beats a
   * confident wrong number.
   */
  netSalesDollars?: number | null;
  /** Last known cohort observation date, shown when Net Sales is unavailable. */
  netSalesAsOf?: string | null;
  /**
   * How far Net Sales is behind the reporting cutoff, e.g. "1 selling day
   * behind, 2 calendar days old". Null when it is current.
   *
   * ⚠️ NOT decoration. Since 2026-08-13 the target prorates to elapsed selling
   * days through Net Sales' OWN coverage date, so numerator and denominator
   * share a date — which means a LATE feed makes this tile look BETTER. On
   * 2026-08-12 that is $423,553 on Balance and $669,117 on Projected Pace. This
   * badge is what discharges that, so it renders on the tile itself rather than
   * in a banner a reader can scroll past.
   */
  netSalesLag?: string | null;
  /**
   * Set when the reporting clock REFUSED this figure — its file covers past the
   * cutoff, so it contains activity outside the reporting period. Renders as
   * unavailable with the reason, never as a number.
   */
  netSalesRefused?: string | null;
  /** This period's Net Sales ÷ sales count. 0 = no sales yet — DISPLAY ONLY. */
  periodAvgSaleDollars?: number;
  /** Sales count behind it, so the tile can say "no sales yet" rather than $0. */
  periodSalesCount?: number;
  /** Report 137 issued count — the SAME actual Funnel vs Goal shows, so
   *  "still needed" counts down against it. Falls back to the funnel VM. */
  cohortIssued?: number | null;
}) {
  const p = vm.pace;

  // A refused figure is not a figure. Treated exactly like an unavailable one:
  // the gate's whole purpose is that a value past the cutoff never renders.
  const onNetSales = netSalesDollars != null && !netSalesRefused;
  const actual = netSalesDollars ?? 0;

  // Projected period-end = current run-rate × selling days in the whole period.
  // `sellingDays` and the `paceGoal` behind Target to Date come off the SAME
  // period window (the whole months the goal sums over) — see §1 in
  // lib/queries/periodBasis.test.ts. Until 2026-08-06 this expanded a YTD
  // run-rate over the whole calendar year while the goal covered eight months,
  // which is how Projected Pace rendered $88.4M against an $84.5M goal on the
  // same screen as a −$22.5M Balance.
  const projected = p.daysElapsed > 0 ? Math.round((actual / p.daysElapsed) * p.sellingDays) : 0;
  // The formula is unchanged. What changed is the claim it makes about itself:
  // extrapolating a full period from 6 of 26 days is arithmetic, not a forecast,
  // and released dollars are structurally low early because net matures over
  // ~5–6 months. Below 30% elapsed the tile says which it is.
  const EARLY_PERIOD_THRESHOLD = 0.3;
  const early =
    p.sellingDays > 0 && p.daysElapsed / p.sellingDays < EARLY_PERIOD_THRESHOLD;
  // Balance = actual vs the prorated target-to-date (dollars ahead of / behind
  // pace). Recomputed on the Net Sales basis rather than reusing `p.gap`, which
  // was measured against RTP — mixing the two would put a Net Sales headline
  // above a Balance that disagrees with it.
  //
  // ⚠️ THE TARGET MUST STOP WHERE THE ACTUAL STOPS. `p.paceGoal` prorates to the
  // report 134's RTP coverage watermark, which is right for an RTP actual and wrong
  // for this one: Net Sales is dated by CONTRACT date and reaches the cohort's
  // own as-of, typically several selling days later. Measuring 8 days of actual
  // against 5 days of target would have flattered Balance by ~38%. On Net Sales
  // the target prorates to the period's elapsed selling days instead.
  const targetToDate = onNetSales
    ? Math.round(prorateGoal(p.monthlyGoal, p.daysElapsed, p.sellingDays) ?? 0)
    : p.paceGoal;
  const balance = Math.round(actual - targetToDate);
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
  // Issue rate USED to ride this tile. It is deleted, not hidden (§6, §13): it
  // divided appointment-grain Issued by lead-grain raw leads, a bridge that has
  // never been proven. Nothing replaces it here — the honest render is its
  // absence, and the leads-needed row in the goal editor states the reason.
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

  // Net Sales unavailable → the actual, Projected Pace and Balance all render
  // "—". Unavailable is NOT zero: a fabricated $0 reads as "behind goal" and as
  // a full-month cancellation at the same time. It is also not a cue to show
  // RTP instead — see the prop doc above.
  const pending = !onNetSales;
  const unavailableSub = netSalesRefused
    ? "covers past the reporting cutoff — withheld"
    : netSalesAsOf
      ? `source temporarily unavailable · last read ${shortDate(netSalesAsOf)}`
      : "source temporarily unavailable";

  const projectedSub = pending
    ? "no Net Sales to project from"
    : early
      ? `early estimate · ${num(p.daysElapsed)} of ${num(p.sellingDays)} selling days`
      : projTone === "neg"
        ? "behind goal"
        : "on / ahead of goal";

  // Revenue reaches its OWN date — report 134's RTP coverage end, which trails the
  // date the COUNTS reach whenever a report has not landed for the most recent
  // days. Both the revenue figure and the target it is measured against now
  // prorate to this date, so the tiles SAY it: two different dates on one screen
  // is honest, one figure built from two dates is not. See docs/revenue-as-of.md.
  const revThrough = p.revenueAsOf ? `through ${shortDate(p.revenueAsOf)}` : null;
  // Only worth calling out when it actually differs from the count basis;
  // otherwise it is noise on every tile.
  const revLags = p.revenueDaysElapsed != null && p.revenueDaysElapsed !== p.daysElapsed;
  const revDaysSub =
    revLags && p.revenueDaysElapsed != null
      ? ` · ${num(p.revenueDaysElapsed)} of ${num(p.sellingDays)} selling days`
      : "";

  // ── Issued Leads Needed to Goal ───────────────────────────────────────────
  //
  // ⚠️ "LEAD ISSUED" MEANS AN ISSUED APPOINTMENT, which is the house term and
  // the same one the "Net Sales $ / Issued Lead" tile below already uses. The
  // denominator here is `NumIssued` — appointment grain — so this is NOT a
  // raw-lead count and must never be divided into one. The label carries
  // "Issued" for exactly that reason: "Leads Needed to Goal" read as a
  // top-of-funnel figure it has never been. See §13 and lib/scorecard/leadRate.ts
  // for the grain bridge that stays unproven.
  //
  // RULING 2026-09-18: ONE issued target on the page — the Σ-of-offices total
  // Funnel vs Goal's Period Goal uses. It used to be goal ÷ blended NSLI (3,221
  // for Aug) beside a funnel reading 3,189. The rate shown with it is goal ÷
  // this number, so the two multiply back to the goal. A null total renders "—"
  // with the reason, never a fabricated target.
  const nsli = p.planningNsli;
  const issuedActual = cohortIssued ?? vm.funnel.find((f) => f.key === "issued")?.actual ?? 0;
  const leadsNeeded = p.issuedNeeded != null ? Math.round(p.issuedNeeded) : null;
  const partialCoverage =
    p.planningIssuedGoal != null && p.planningIssuedGoal < p.monthlyGoal - 1;
  const leadsRemaining = leadsNeeded == null ? null : Math.max(0, leadsNeeded - issuedActual);

  const kpis: Kpi[] = [
    { label: goalLabel, sub: goalSub, value: usd(p.monthlyGoal) },
    {
      label: "Projected Pace",
      sub: projectedSub,
      value: pending ? "—" : usd(projected),
      // Early in a period the extrapolation is too thin to carry a verdict
      // colour; the figure still shows, in neutral.
      tone: pending || early ? "plain" : projTone,
      title: early
        ? `Run-rate extrapolation from ${p.daysElapsed} completed selling day${p.daysElapsed === 1 ? "" : "s"} of ${p.sellingDays}. Early-period projections are noisy, and released dollars run structurally low because net matures over roughly five to six months.`
        : undefined,
    },
    {
      label: "Target to Date",
      // Names the SAME date as the Net tile: this is the whole point of the
      // alignment, and a reader has to be able to see that the numerator and
      // the denominator stop on the same day.
      sub: onNetSales
        ? `goal through ${num(p.daysElapsed)} of ${num(p.sellingDays)} selling days`
        : revThrough
          ? `goal ${revThrough}${revDaysSub}`
          : "goal to date",
      value: usd(targetToDate),
      title: onNetSales
        ? "Prorated to the selling days elapsed — the same days the Net Sales figure covers. Both stop on the same day by construction, because Net Sales is dated by contract date and has no separate coverage watermark."
        : revLags
        ? `Prorated to ${usDate(p.revenueAsOf!)} — report 134's RTP coverage date — not to ${usDate(vm.snapshot.asOfDate)}, which is how far the COUNTS reach. Released dollars are not knowable past the last report, so the target they are measured against stops on the same day.`
        : undefined,
    },
    // THE HEADLINE ACTUAL. Until 2026-08-12 this tile showed RTP — report 134,
    // released to production — which is dated by production MILESTONE, so a
    // contract sold in April lands in August. It answered a production question
    // on a sales scoreboard and could not be paced against a sales goal. RTP is
    // still ingested and still rendered, on the Released panel below, where its
    // basis is stated and nothing is paced against it. It is NOT a fallback for
    // this tile under any condition.
    {
      label: `Net Sales ${vm.abbr}`,
      sub: pending
        ? unavailableSub
        : netSalesLag
          ? `gross written − cancellations − financing denied · ${netSalesLag}`
          : "gross written − cancellations − financing denied",
      value: pending ? "Unavailable" : usd(actual),
      tone: "plain",
      title: netSalesRefused
        ? netSalesRefused
        : pending
        ? "Net Sales could not be read from the cohort source. No other figure is substituted here: released-to-production dollars are a different economic event on a different date basis, and showing them in this position would misreport the month. The Released panel below still carries RTP."
        : "Net Sales: the contract value written in this period, less the two TERMINAL losses — cancellations and financing denials. Working and hold dollars are still counted, because they are still live deals. This is the basis the goal, the pace and the efficiency denominator are all measured on. It is dated by CONTRACT date, so it never borrows a dollar from another month.",
    },
    {
      label: "Balance",
      sub: pending ? "report pending" : balance >= 0 ? "ahead of target" : "behind target",
      value: pending ? "—" : signed(balance),
      tone: pending ? "plain" : balTone,
    },
    {
      label: "Issued Leads Needed to Goal",
      sub:
        leadsNeeded == null
          ? "no rate history — not computable"
          : `${num(leadsRemaining ?? 0)} still needed · ${usdCents(nsli ?? 0)}/lead issued${partialCoverage ? " · excludes offices with no rate history" : ""}`,
      value: leadsNeeded == null ? "—" : num(leadsNeeded),
      title:
        `Σ of each office's goal ÷ that office's own trailing ${METRIC_LABELS.netPerIssuedAppointment} — the same number as Funnel vs Goal's Issued Period Goal. × the needed rate beside it = the goal.`,
    },
    {
      label: "Elapsed / Working Days",
      // When the goal-bearing feed lags, the pace math counts FEWER days than
      // the calendar has. Naming the gap here is what stops that reading as a
      // free day: without it the tile would quietly say 8 on a day the calendar
      // says 9, and the target would be lower with nothing on screen to explain
      // why. See the ruling on buildScorecardVM's clockElapsedDays.
      sub:
        p.calendarDaysElapsed > p.daysElapsed
          ? `${num(Math.round(p.elapsedPct))}% of period · ${num(p.calendarDaysElapsed - p.daysElapsed)} not yet reported`
          : `${num(Math.round(p.elapsedPct))}% of period`,
      value: `${num(p.daysElapsed)} / ${num(p.sellingDays)}`,
      title:
        p.calendarDaysElapsed > p.daysElapsed
          ? `The target is prorated over ${num(p.daysElapsed)} selling days — the days the sales report actually covers — so it stops where the actual stops. ${num(p.calendarDaysElapsed)} selling days have elapsed on the calendar; the difference is a feed that has not reported yet, not days that did not happen.`
          : undefined,
    },
    {
      label: "Average Sale",
      sub:
        (periodSalesCount && periodSalesCount > 0
          ? `this period · ${periodSalesCount} sales`
          : "no sales this period yet") +
        (p.planningAvgSale != null && p.planningAvgSale > 0 ? ` · needed ${usdCents(p.planningAvgSale)}` : ""),
      value: usd(periodAvgSaleDollars ?? 0),
      title:
        "This period's Net Sales ÷ this period's sales count. Shown for the " +
        "meeting only — every target on this page is still derived from the " +
        `trailing-90-day average sale (${p.avgSale > 0 ? usd(p.avgSale) : "—"}).`,
    },
    {
      // RULING 2026-09-18: headline = the NSLI the goal NEEDS (goal ÷ issued
      // needed), so it × Issued Leads Needed = the goal. The blended trailing
      // actual stays visible underneath, labelled as actual.
      // §16 keeps this metric's NAME appointment-grain — never the retired bare
      // acronym, and never "per Issued Lead" (labels.ts). "Needed" is the only
      // word this tile adds to the sanctioned label.
      label: `${METRIC_LABELS.netPerIssuedAppointment} Needed`,
      sub:
        p.nsli > 0
          ? `goal ÷ issued needed · actual ${usd(p.nsli)} · ${windowSub}`
          : "goal ÷ issued needed",
      value: p.planningNsli != null && p.planningNsli > 0 ? usdCents(p.planningNsli) : "—",
      title:
        (rateTitle ? `${rateTitle} · ` : "") +
        `Needed = goal ÷ the issued target built office by office. Actual = the blended company ${METRIC_LABELS.netPerIssuedAppointment} over the rate window, including markets with no goal — it will not multiply back to the goal.`,
      flag: p.rateWidened,
    },
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
      {/* Nine tiles since the Leads-Needed tile landed (2026-09-04), so the xl
          track count moved 8 → 9 with them. A ninth tile in an 8-column grid
          wraps alone onto a second row, which reads as a rendering fault rather
          than as a KPI. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-slate-100 px-4 py-5 dark:border-slate-800/70 sm:grid-cols-4 sm:gap-x-6 sm:px-5 xl:grid-cols-9">
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
