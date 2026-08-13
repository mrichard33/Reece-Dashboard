"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { num, usd } from "@/lib/utils";
import { pct } from "./format";
import { ScSection } from "./ScSection";
import { METRIC_LABELS, METRIC_FORMULAS } from "@/lib/scorecard/labels";
import { formatPace, formatPaceShort } from "@/lib/scorecard/paceLanguage";
import type { ByMarketRow, ByMarketView } from "@/lib/queries/byMarket";

/**
 * Section ⑤ — By Market. Each market's funnel + revenue for the selected period,
 * with a pace bar, plus the All-Markets total. Rows sum to the total. Clicking a
 * row scopes the whole scorecard to that market (`?market=`). Utility rows
 * (Unassigned / Out of Area) show only with activity.
 *
 * The bar and its colour read `pctToGoal` — net vs the market's PRORATED to-date
 * goal — exactly as before. What changed is the caption. It used to read
 * "109% goal", which invites the reading that a market holding 25% of its money
 * has banked 109% of the target; it now states the two figures behind that ratio
 * ("25% achieved / 23% elapsed · +2 pts ahead of pace"). Same verdict, same
 * colour, no market moves.
 */
/**
 * Report 135's two LEAD-grain figures.
 *
 * Deliberately NOT in `labels.ts`. That module is the vocabulary for RATES —
 * `labels.test.ts` requires every entry to carry a "÷" formula, and
 * `grainContract.ts` refuses a bare count for the same reason — so these live
 * here as literals, exactly like "Leads", "Issued", "Demos" and "Sales" beside
 * them.
 *
 * ⚠️ "Leads" is report 135's ROW count; LEADS_DISTINCT is its LEAD count. Two
 * counts of one period at two grains — NOT a numerator and a denominator.
 * Dividing one into the other yields an artefact of how many disposition states
 * each lead passed through, not a rate. §13's grain bridge stays unproven.
 */
const LEADS_DISTINCT = "Leads (distinct)";
const LEADS_SUPERSEDED = "Duplicates merged by LP";
/** Why the duplicate figure can be trusted without a confidence score. */
const LEADS_GRAIN_HELP =
  `${LEADS_DISTINCT} — distinct lp_lead_id, not rows. ${LEADS_SUPERSEDED} — Σ LP's NumSuperseded, ` +
  `counted once per lead. This is LP's own merge decision reported as-is; nothing is matched or ` +
  `scored here, and no confidence threshold is involved.`;

export function ByMarketTable({ data, abbr }: { data: ByMarketView; abbr: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { rows, total } = data;

  function open(code: string) {
    const next = new URLSearchParams(params.toString());
    if (code === "REECE") next.delete("market");
    else next.set("market", code);
    router.replace(`?${next.toString()}`);
  }

  const cell = "px-3 py-2 text-right font-mono tabular";
  const headCell = "px-3 py-2.5 text-right font-semibold";

  // The date these Net Sales figures actually cover — the LEAST-covered market,
  // so the header can never claim coverage one of its rows does not have.
  const dataThrough =
    [total, ...rows]
      .map((r) => r?.net_sales_through ?? null)
      .filter((d): d is string => d != null)
      .sort()[0] ?? null;

  const goalBar = (pctToGoal: number) => (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={`h-full rounded-full ${pctToGoal >= 100 ? "bg-emerald-500" : pctToGoal >= 90 ? "bg-amber-500" : "bg-brick"}`}
        style={{ width: `${Math.min(100, pctToGoal)}%` }}
      />
    </div>
  );

  // Mobile: one tappable card per market (the table is too wide to read at 390px).
  // Render helpers (NOT components — they close over `open`, and defining
  // components during render resets their state; plain function calls don't).
  const renderMobileCard = (r: ByMarketRow, strong?: boolean) => {
    const metrics: [string, string][] = [
      ["Leads", num(r.leads)],
      // Spelled out here — the card has the width the table cell does not.
      // Omitted entirely when unsourced; "0 duplicates" is a different claim.
      ...(r.leads_superseded != null
        ? ([
            [LEADS_DISTINCT, num(r.leads_distinct)],
            [LEADS_SUPERSEDED, num(r.leads_superseded)],
          ] as [string, string][])
        : []),
      ["Issued", num(r.issued)],
      ["Demos", num(r.demos)],
      ["Sales", num(r.sales)],
      [METRIC_LABELS.demo, r.utility ? "—" : pct(r.demo_pct)],
      [METRIC_LABELS.demoToSale, r.utility ? "—" : pct(r.demo_to_sale_pct)],
      ["Gross written", usd(r.gross_sales)],
    ];
    const paceLine = formatPace(r);
    return (
      <button
        key={r.market + (strong ? "|total" : "")}
        type="button"
        onClick={() => open(r.market)}
        className={`block w-full rounded-lg border px-3.5 py-3 text-left transition active:bg-slate-50 dark:active:bg-slate-900/50 ${
          strong
            ? "border-slate-300 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40"
            : "border-slate-200 dark:border-slate-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[14px] font-semibold ${r.utility ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
            {r.label}
          </span>
          {/* Never a bare dollar figure beside a market name — a number with no
              label is the reader's problem to solve, and they solve it wrong. */}
          <span className="shrink-0 text-right">
            <span className="block text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
              Net Sales {abbr}
            </span>
            <span className="block font-mono text-[15px] font-bold tabular text-slate-900 dark:text-slate-100">
              {usd(r.net_sales)}
            </span>
          </span>
        </div>
        {r.pctToGoal != null && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {goalBar(r.pctToGoal)}
              <span className="w-[86px] shrink-0 text-right font-mono text-[11px] tabular text-slate-500">
                {num(Math.round(r.pctToGoal))}% of {abbr} target
              </span>
            </div>
            {paceLine && (
              <span className="font-mono text-[11px] tabular text-slate-500 dark:text-slate-400">
                {paceLine}
              </span>
            )}
          </div>
        )}
        <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
              <div className="mt-0.5 font-mono text-[12.5px] tabular text-slate-700 dark:text-slate-200">{value}</div>
            </div>
          ))}
        </div>
      </button>
    );
  };

  const renderRow = (r: ByMarketRow, strong?: boolean) => (
    <tr
      key={r.market + (strong ? "|total" : "")}
      onClick={() => open(r.market)}
      className={`cursor-pointer border-t border-slate-50 transition hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50 ${
        strong ? "border-t-2 border-t-slate-200 font-semibold dark:border-t-slate-700" : ""
      }`}
    >
      <td className={`px-3 py-2 text-left ${strong ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-200"} ${r.utility ? "text-slate-400 dark:text-slate-500" : ""}`}>
        {r.label}
      </td>
      {/* The headline is report 135's ROW count; the sub-line is the same
          period at LEAD grain. Absent (pre-2026-08-13 snapshots) renders
          NOTHING rather than "0 duplicates", which would be a claim we cannot
          make — see ByMarketRow.leads_superseded. */}
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>
        {num(r.leads)}
        {r.leads_superseded != null && (
          <span
            className="mt-0.5 block text-[10px] font-normal leading-tight text-slate-400 dark:text-slate-500"
            title={LEADS_GRAIN_HELP}
          >
            {num(r.leads_distinct)} distinct · {num(r.leads_superseded)} dupes
          </span>
        )}
      </td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{num(r.issued)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{num(r.demos)}</td>
      <td className={`${cell} text-slate-900 dark:text-slate-100`}>{num(r.sales)}</td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`} title={METRIC_FORMULAS.demo}>
        {r.utility ? "—" : pct(r.demo_pct)}
      </td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`} title={METRIC_FORMULAS.demoToSale}>
        {r.utility ? "—" : pct(r.demo_to_sale_pct)}
      </td>
      <td className={`${cell} text-slate-600 dark:text-slate-300`}>{usd(r.gross_sales)}</td>
      <td className={`${cell} text-slate-900 dark:text-slate-100`}>{usd(r.net_sales)}</td>
      <td className={`${cell} text-slate-500 dark:text-slate-400`}>{r.goal == null ? "—" : usd(r.goal)}</td>
      <td className="px-3 py-2">
        {r.pctToGoal == null ? (
          <span className="block text-right text-slate-400">—</span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center justify-end gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${r.pctToGoal >= 100 ? "bg-emerald-500" : r.pctToGoal >= 90 ? "bg-amber-500" : "bg-brick"}`}
                  style={{ width: `${Math.min(100, r.pctToGoal)}%` }}
                />
              </div>
              <span className="w-11 text-right font-mono text-[12px] tabular text-slate-500">{num(Math.round(r.pctToGoal))}%</span>
            </div>
            {/* The two figures behind the ratio — colour is never the only signal. */}
            {formatPaceShort(r) && (
              <span
                className="font-mono text-[10.5px] tabular text-slate-400 dark:text-slate-500"
                title={formatPace(r) ?? undefined}
              >
                {formatPaceShort(r)}
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <ScSection
      id="sc-bymarket"
      label="By Market"
      // The basis and its coverage date, on the section rather than per cell —
      // these cards showed RTP through 08-06 beside counts through 08-10 and
      // said nothing about either. `net_sales_through` is report 137's
      // data_through, not its run date.
      // A4: the cohort basis is named on the section, once, rather than left
      // for a reader to infer per column. Every count and dollar in this table
      // is report 137 on the appointment-date cohort — one cohort per row.
      meta={
        "Report 137 · appointment-date cohort · " +
        (dataThrough ? `through ${dataThrough} · ` : "") +
        "Tap a market to open its scorecard"
      }
    >
      {/* Phone + tablet: stacked cards */}
      <div className="space-y-2 border-t border-slate-100 px-3 py-3 dark:border-slate-800/70 lg:hidden">
        {rows.map((r) => renderMobileCard(r))}
        {total && renderMobileCard(total, true)}
      </div>

      {/* Desktop: full table */}
      <div className="hidden overflow-x-auto border-t border-slate-100 px-2 py-1 dark:border-slate-800/70 lg:block lg:px-4 lg:py-2">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2.5 text-left font-semibold">Market</th>
              <th className={headCell} title={`Leads bought in this window. Report 135 (Lead Disposition), lead-cohort basis — NOT the appointment cohort the rest of this row is on, and deliberately not divided into it: lead grain and appointment grain have no proven bridge.\n\nThe headline is a ROW count. 135 is emitted at lead × disposition-state grain, so one lead contributes several rows — which is why "${LEADS_DISTINCT}" is smaller, and why the duplicate figure is shown against IT and not against the row count.`}>Leads</th>
              {/* A4: every appointment count names its cohort basis and its
                  report. These three and the two rates beside them are all
                  report 137, all appointment-date — the same rows as the
                  dollars. They will NOT tie to Appointment Statistics and are
                  not meant to. */}
              <th className={headCell} title="Appointments issued. Report 137, APPOINTMENT-DATE cohort — the same rows as Gross Written and Net Sales in this row. Does not tie to Appointment Statistics (446 here vs 418 there for 8/2–8/8): different cohort basis, different attribution.">Issued</th>
              <th className={headCell} title="Appointments sat (demos). Report 137, APPOINTMENT-DATE cohort.">Demos</th>
              <th className={headCell} title="Gross sales count. Report 137, APPOINTMENT-DATE cohort.">Sales</th>
              <th className={headCell} title={`${METRIC_FORMULAS.demo} · Report 137 · appointment-date cohort. NOT "Company Demo %", which is the call-center metric on a SET-date cohort and a different number.`}>
                {METRIC_LABELS.demo}
              </th>
              <th className={headCell} title={`${METRIC_FORMULAS.demoToSale} · Report 137 · appointment-date cohort.`}>
                {METRIC_LABELS.demoToSale}
              </th>
              <th className={headCell} title="Contract value WRITTEN for appointments in this period. Report 137, appointment-date cohort.">Gross written</th>
              <th className={headCell} title="Net Sales = Gross Written − Cancellations − Financing Denied. Report 137, appointment-date cohort. Working and Hold stay IN it — unresolved business is not loss. This is the goal-bearing figure — the same basis as the company hero and this market's goal.">
                Net Sales
              </th>
              <th className={headCell}>{abbr} target</th>
              <th className={headCell} title="Net ÷ the goal prorated to selling days elapsed. 100% = exactly on pace.">
                % of {abbr} target
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => renderRow(r))}
            {total && renderRow(total, true)}
          </tbody>
        </table>
      </div>
    </ScSection>
  );
}
