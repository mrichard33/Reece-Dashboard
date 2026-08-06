import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { CELL, HEAD, LABEL_CELL, SECONDARY, TierShell, Val } from "./TierShell";
import { marketLabel } from "@/lib/scorecard/markets";
import { num } from "@/lib/utils";
import type { Measured } from "@/lib/scorecard/tiers/types";
import type { Tier3 } from "@/lib/scorecard/tiers/tier3";

/**
 * TIER 3 — Revenue leakage, with Time-to-Net alongside.
 *
 * Time-to-Net sits here on purpose: it is what tells you whether a leak is
 * permanent loss or slow recognition. A long right tail is a workflow problem;
 * genuine cancellations are a sales-quality problem. Without it the two look
 * identical and get the same (wrong) intervention.
 */

/** A rising leak share is bad — the arrow is red UP, green DOWN. */
function Trend({ m }: { m: Measured }) {
  if (!m.known) {
    return (
      <span className="cursor-help text-slate-300 dark:text-slate-600" title={m.reason}>
        <Minus size={13} className="inline" />
      </span>
    );
  }
  const v = m.value;
  if (Math.abs(v) < 0.05) {
    return <span className="text-slate-400 dark:text-slate-500">flat</span>;
  }
  const up = v > 0;
  return (
    <span className={up ? "text-brick dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
      {up ? <ArrowUp size={12} className="inline" /> : <ArrowDown size={12} className="inline" />}{" "}
      {v > 0 ? "+" : ""}
      {v.toFixed(1)} pts
    </span>
  );
}

export function Tier3Leakage({ data }: { data: Tier3 }) {
  const ttn = data.timeToNet;

  return (
    <TierShell meta={data.meta}>
      {/* Headline: the evaporation, stated once, in net terms. */}
      <div className="grid grid-cols-1 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-800">
        {[
          { label: "Gross sold", m: data.grossSold, note: "input row only — never a headline" },
          { label: "Net sold", m: data.netSold, note: "what actually became revenue" },
          { label: "Evaporated", m: data.totalLeak, note: "gross − net", brick: true },
        ].map((t) => (
          <div key={t.label} className="bg-white px-5 py-3 dark:bg-slate-950">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t.label}
            </div>
            <div
              className={`font-mono text-[19px] font-bold tabular ${
                t.brick ? "text-brick dark:text-rose-400" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              <Val m={t.m} kind="usd" />
            </div>
            <div className={SECONDARY}>{t.note}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr>
              <th className={`${LABEL_CELL} font-semibold`}>Leak</th>
              <th className={HEAD}>Jobs</th>
              <th className={HEAD}>Dollars</th>
              <th className={HEAD}>% of gross sold</th>
              <th className={HEAD}>MoM trend</th>
            </tr>
          </thead>
          <tbody>
            {data.leaks.map((l) => (
              <tr key={l.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className={LABEL_CELL}>
                  <div className="font-medium text-slate-900 dark:text-slate-100">{l.label}</div>
                  <div className={SECONDARY}>{l.note}</div>
                </td>
                <td className={CELL}>
                  <Val m={l.count} />
                </td>
                <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
                  <Val m={l.dollars} kind="usd" />
                </td>
                <td className={CELL}>
                  <Val m={l.pctOfGross} kind="pct" />
                </td>
                <td className={`${CELL} text-[12px]`}>
                  <Trend m={l.trendPts} />
                </td>
              </tr>
            ))}

            {/* Reconciliation. The residual is a NAMED line — never absorbed. */}
            <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-900/40">
              <td className={`${LABEL_CELL} font-semibold text-slate-700 dark:text-slate-200`}>
                Σ leaks
              </td>
              <td className={CELL} />
              <td className={`${CELL} font-semibold`}>
                <Val m={data.leakSubtotal} kind="usd" />
              </td>
              <td className={CELL} colSpan={2} />
            </tr>
            <tr className="bg-slate-50/70 dark:bg-slate-900/40">
              <td className={LABEL_CELL}>
                <div className="font-semibold text-amber-700 dark:text-amber-400">Unreconciled</div>
                <div className={SECONDARY}>
                  Net − (Gross − Σleaks). Named, never folded into a bucket to force a tie.
                </div>
              </td>
              <td className={CELL} />
              <td className={`${CELL} font-semibold text-amber-700 dark:text-amber-400`}>
                <Val m={data.unreconciled} kind="usdExact" signed />
              </td>
              <td className={CELL} colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <p
        className={`border-t px-5 py-2 text-[11.5px] ${
          data.reconciles
            ? "border-slate-100 text-slate-500 dark:border-slate-800 dark:text-slate-400"
            : "border-brick/30 bg-brick/5 text-brick dark:text-rose-400"
        }`}
      >
        {data.reconciles
          ? "Gross − Σleaks + unreconciled = Net, to the cent."
          : "This table does NOT reconcile — treat every figure here as provisional until it does."}
      </p>

      {/* Time-to-Net */}
      <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-display text-[12.5px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
            Time-to-Net
            <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
              — RTP date − contract date. Long tail = workflow problem; cancellations = sales-quality
              problem.
            </span>
          </h4>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className={`${LABEL_CELL} font-semibold`}>Market</th>
                <th className={HEAD}>Median</th>
                <th className={HEAD}>p75</th>
                <th className={HEAD}>Slowest</th>
                <th className={HEAD}>Jobs</th>
              </tr>
            </thead>
            <tbody>
              {ttn.markets.map((s) => (
                <tr key={s.market} className="border-t border-slate-100 dark:border-slate-800">
                  <td className={LABEL_CELL}>{marketLabel(s.market)}</td>
                  <td className={`${CELL} font-semibold text-slate-900 dark:text-slate-100`}>
                    <Val m={s.medianDays} kind="days" />
                  </td>
                  <td className={CELL}>
                    <Val m={s.p75Days} kind="days" />
                  </td>
                  <td className={CELL}>
                    <Val m={s.maxDays} kind="days" />
                  </td>
                  <td className={`${CELL} ${SECONDARY}`}>{num(s.n)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50/70 font-semibold dark:border-slate-600 dark:bg-slate-900/40">
                <td className={LABEL_CELL}>All Markets</td>
                <td className={CELL}>
                  <Val m={ttn.company.medianDays} kind="days" />
                </td>
                <td className={CELL}>
                  <Val m={ttn.company.p75Days} kind="days" />
                </td>
                <td className={CELL}>
                  <Val m={ttn.company.maxDays} kind="days" />
                </td>
                <td className={`${CELL} ${SECONDARY}`}>{num(ttn.company.n)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="pt-2 text-[11.5px] text-slate-500 dark:text-slate-400">{ttn.sampleNote}</p>
      </div>
    </TierShell>
  );
}
