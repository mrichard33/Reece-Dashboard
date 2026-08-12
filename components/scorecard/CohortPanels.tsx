import { ScSection } from "./ScSection";
import { InfoPopover } from "@/components/help/InfoPopover";
import { usd, usDate } from "@/lib/utils";
import {
  decompose,
  lostRate,
  netSalesCents,
  netRetentionRate,
  netSurvivalRate,
  pendingRate,
  waterfallDelta,
  waterfallWarning,
  type CohortObservation,
  type SettledNetRetention,
} from "@/lib/queries/cohorts.core";
import type { Measured } from "@/lib/scorecard/tiers/types";

/**
 * Panels ② and ③ of the scorecard: the modeled outcome and the measured cohort
 * quality. Server components — every figure arrives computed.
 *
 * The two are deliberately adjacent and deliberately different-looking. ② is a
 * FORECAST and is drawn as one; ③ is MEASURED and is drawn as a table of
 * dollars. The page's rule that no figure is subtracted across panels holds
 * here too.
 */

const money = (cents: number | null) => (cents == null ? "—" : usd(Math.round(cents / 100)));
const pctOf = (m: Measured) => (m.known ? `${(m.value * 100).toFixed(1)}%` : "—");

/** MM-YYYY → "Jun 2026". Cohorts are months and read better named than dated. */
function monthLabel(appointmentMonth: string): string {
  const [y, m] = appointmentMonth.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

// ─── ② EXPECTED ECONOMIC OUTCOME — modeled ───────────────────────────────────

/**
 * ⚠️ THIS IS NOT A QUALITY METRIC. Expected Settled Net is Gross Written × a
 * historical constant, so within a month a manager raises it only by writing
 * MORE, never by writing BETTER. Every string in this component is written to
 * keep that true. The quality incentive lives in panel ③.
 *
 * ⚠️ AND MATURATION INVERTS. Losses accrue with age, so a YOUNG cohort reads too
 * GOOD: July 76.3% and August 84.8% against a settled ~71%. August is currently
 * overstated by roughly $300K and will FALL. The panel says so rather than
 * letting a reader mistake a young month's retention for an improvement.
 */
export function ExpectedOutcomePanel({
  grossWrittenCents,
  monthlyGoalDollars,
  rate,
  abbr,
  asOf,
}: {
  grossWrittenCents: number | null;
  monthlyGoalDollars: number | null;
  rate: Measured<SettledNetRetention>;
  abbr: string;
  asOf: string | null;
}) {
  // TWO decimal places. At one, this rate and the NSA-numerator version it
  // replaced are both "71.1%" — the whole difference lives in the second digit.
  const pct = rate.known ? `${(rate.value.rate * 100).toFixed(2)}%` : null;
  const expected =
    rate.known && grossWrittenCents != null
      ? Math.round((grossWrittenCents * rate.value.rate) / 100)
      : null;
  const atGoal =
    rate.known && monthlyGoalDollars != null
      ? Math.round(monthlyGoalDollars * rate.value.rate)
      : null;

  // The goal is NAMED, never assumed. A tile reading "Expected Settled Value at
  // Goal" with no figure is the screenshot that becomes a new net target in
  // somebody's deck by Friday; naming the goal it was computed from is what
  // stops that. The goal is whatever the SELECTED MONTH stores — it is not a
  // constant, and August 2026 ($11.01M) is not January ($10.4M).
  const goalName = monthlyGoalDollars != null ? usd(monthlyGoalDollars) : null;

  const info = {
    title: "Expected Settled Net",
    what:
      "A FORECAST, not a measurement: this period's Gross Written multiplied by SETTLED " +
      "NET RETENTION — Net Sales divided by Gross Written, summed over cohorts old " +
      "enough to have settled. It does not measure how well anyone sold: at a fixed " +
      "volume it cannot move. Writing more raises it; writing better does not.",
    where: rate.known
      ? `Basis: Gross Written × ${pct}, from ${rate.value.cohortCount} cohorts at least ` +
        `${rate.value.eligibilityDays} days old measured from the FIRST of the appointment ` +
        `month (${money(rate.value.grossCents)} written) · report 137 · appointment-date ` +
        `cohort · ${abbr}${asOf ? ` · as of ${usDate(asOf)}` : ""}`
      : "Basis: not computable yet — no cohort is old enough to model from.",
    fix:
      "The numerator is NET SALES, not Report 137 NSA. The NSA version of this rate is " +
      "71.06% against this one's 71.10% — identical to one decimal place, which is why " +
      "the distinction has to be stated rather than eyeballed. NSA also removes live " +
      "Working and Hold, which are unresolved business rather than loss. Maturation " +
      "INVERTS here: losses accrue over time, so young cohorts read too GOOD and will " +
      "fall. The rate is re-derived as cohorts age, never hardcoded.",
  };

  return (
    <ScSection
      id="expected-outcome"
      label="Expected Economic Outcome"
      tail="modeled — not a measured dollar"
      meta={rate.known ? `${pct} settled net retention` : "not yet computable"}
    >
      {/* Dashed borders and the amber wash mark the whole panel as an estimate.
          Nothing else on this page is drawn this way. */}
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-4 py-3 dark:border-amber-600/70 dark:bg-amber-900/15">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Expected Settled Net
            <InfoPopover info={info} />
          </div>
          <div className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular text-amber-900 dark:text-amber-200">
            {expected == null ? "—" : `~${usd(expected)}`}
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-amber-800/80 dark:text-amber-300/80">
            {rate.known ? (
              <>
                {pct} Settled Net Retention
                <br />
                <span className="opacity-80">Net Sales ÷ Gross Written · eligible cohorts</span>
                <br />
                {/* Sample size in COHORTS and DOLLARS. Never "n=17
                    observations" — re-reading one cohort five times is five
                    observations and one sample. */}
                Based on {rate.value.cohortCount} eligible cohort
                {rate.value.cohortCount === 1 ? "" : "s"} · {money(rate.value.grossCents)} written
              </>
            ) : (
              (!rate.known && rate.reason) || "no settled history yet"
            )}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 px-4 py-3 dark:border-amber-600/70 dark:bg-amber-900/15">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            {goalName
              ? `Expected Settled Value at the ${goalName} goal`
              : "Expected Settled Value at goal"}
          </div>
          <div className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular text-amber-900 dark:text-amber-200">
            {atGoal == null ? "—" : `~${usd(atGoal)}`}
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed text-amber-800/80 dark:text-amber-300/80">
            What the {abbr} goal is worth once it settles. This is NOT a goal — the
            goal is {goalName ?? "the stored monthly figure"}, on a Net Sales basis.
          </div>
        </div>
      </div>
    </ScSection>
  );
}

// ─── ③ COHORT QUALITY — measured ─────────────────────────────────────────────

/**
 * A cohort is the month the contract was WRITTEN in, and it is immutable: a
 * July contract stays July business forever and only its disposition changes.
 * Watching the rows age is how a manager sees quality mature.
 */
export function CohortQualityPanel({
  cohorts,
  asOf,
}: {
  cohorts: CohortObservation[];
  asOf: string | null;
}) {
  if (cohorts.length === 0) return null;

  const rows = [...cohorts].sort((a, b) => b.appointmentMonth.localeCompare(a.appointmentMonth));

  const info = {
    title: "Cohort quality",
    what:
      "Every contract stays in the month it was WRITTEN in; only its disposition " +
      "changes. Gross Written is therefore fixed, and the columns to its right show " +
      "what became of it. Net Sales is DEFINED by subtraction — gross written less " +
      "cancellations less financing denied — and nothing else derives it. Pending and " +
      "Matured are LP's separate report of how that business is currently sitting; " +
      "they very nearly sum back to Net Sales, but report 137 does not always foot, " +
      "so the gap is shown as Recon Δ rather than resolved into either figure.",
    where: `Basis: contract date · report 137${asOf ? ` · as of ${usDate(asOf)}` : ""}`,
    fix:
      "A young cohort's low Net Survival Rate is maturation, not necessarily poor " +
      "selling — read it against the Pending column. Once Pending is under about 2% " +
      "the cohort is settled and the rate is a real quality signal.",
  };

  return (
    <ScSection
      id="cohort-quality"
      label="Cohort Quality"
      tail="what each month's selling turned into"
      meta={asOf ? `contract-date cohorts · report 137 · as of ${usDate(asOf)}` : undefined}
    >
      <div className="px-5 pb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Gross Written is immutable — the cohort&apos;s defining figure. Lost is
        cancellations plus financing denied; Pending is working plus hold; Matured is
        LP&apos;s net. <InfoPopover info={info} />
      </div>

      <div className="overflow-x-auto px-5 pb-5">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="py-2 pr-3 text-left font-semibold">Cohort</th>
              <th className="px-2 py-2 text-right font-semibold" title="Contract value WRITTEN in this month. Immutable.">
                Gross Written
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="Gross Written − cancellations − financing denied. The goal-bearing basis.">
                Net Sales
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="Cancellations + financing denied. Terminal — this business is gone.">
                Lost
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="Working + hold. Still undecided.">
                Pending
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="LP's NSA — fully settled net.">
                Net (NSA)
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="Net Sales ÷ Gross Written. Of what we wrote, how much has NOT been permanently lost? Available on any cohort, including the current month.">
                Net Retention %
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="Report 137 NSA ÷ Gross Written. Of what we wrote, how much has LP SETTLED? A diagnostic — NOT the basis of the Expected Settled Net forecast, which uses Net Sales ÷ Gross Written. NSA additionally removes live Working and Hold, so on a young cohort this reads far below Net Retention %: July 2026 is 50.9% here and 76.3% to the left, and the gap is unresolved business, not loss.">
                Net Survival Rate
              </th>
              <th className="px-2 py-2 text-right font-semibold" title="(net + working + hold + cancelled + cd) − gross. A source-data diagnostic; it never adjusts a rate.">
                Recon Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const d = decompose(c);
              const delta = waterfallDelta(c);
              const warn = waterfallWarning(c);
              const pend = pendingRate(c);
              const surv = netSurvivalRate(c);
              return (
                <tr
                  key={`${c.appointmentMonth}-${c.market}`}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800/70"
                >
                  <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200">
                    {monthLabel(c.appointmentMonth)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-slate-800 dark:text-slate-100">
                    {money(d.grossCents)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold tabular text-slate-900 dark:text-slate-50">
                    {money(d.netSalesCents)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-rose-600 dark:text-rose-400">
                    {money(d.lostCents)}
                    <span className="ml-1 text-[10px] text-slate-400">{pctOf(lostRate(c))}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-slate-600 dark:text-slate-300">
                    {money(d.pendingCents)}
                    <span className="ml-1 text-[10px] text-slate-400">{pctOf(pend)}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-slate-800 dark:text-slate-100">
                    {money(d.maturedCents)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-slate-700 dark:text-slate-200">
                    {pctOf(netRetentionRate(c))}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-slate-800 dark:text-slate-100">
                    {pctOf(surv)}
                    {/* A young cohort is not a bad cohort. Say which it is
                        rather than letting a red number imply poor selling. */}
                    {pend.known && pend.value > 0.02 && (
                      <span className="ml-1 text-[10px] font-normal text-amber-600 dark:text-amber-400">
                        still maturing
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular text-[11px]">
                    {delta == null ? (
                      <span className="text-slate-300 dark:text-slate-600" title="The report did not carry every disposition, so the identity cannot be checked.">
                        —
                      </span>
                    ) : (
                      <span
                        className={
                          warn
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400 dark:text-slate-500"
                        }
                        title={warn ? warn.message : "Within tolerance."}
                      >
                        {delta.cents === 0
                          ? "$0"
                          : `${delta.cents > 0 ? "+" : "−"}${usd(Math.abs(Math.round(delta.cents / 100)))}`}
                        <span className="ml-1 text-slate-400">
                          {(delta.pct * 100).toFixed(2)}%
                        </span>
                        {warn && <span className="ml-1" aria-hidden>⚠</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 pb-4 text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
        <strong className="font-semibold">Net Retention %</strong> (Net Sales ÷ Gross
        Written) and <strong className="font-semibold">Net Survival Rate</strong> (Report
        137 NSA ÷ Gross Written) are different questions — not permanently lost, versus
        settled by LP. They converge as a cohort ages and are far apart on a young one,
        because NSA removes Working and Hold while Net Retention keeps them: a $30,000 job
        on permit hold is still good business. The <strong className="font-semibold">first</strong>{" "}
        is the assumption behind Expected Settled Net; the second is a diagnostic.
        <br />
        <strong className="font-semibold">Maturation runs downward.</strong> Losses accrue
        with age, so the youngest cohorts read the BEST and will fall — August 84.8% and
        July 76.3% against a settled ~71%. A young month is not outperforming.
        <br />
        Recon Δ is a source-data diagnostic: where it is non-zero, LP&apos;s disposition
        buckets do not sum to Gross Written. It is recorded and investigated, never
        corrected into either rate.
      </div>
    </ScSection>
  );
}
