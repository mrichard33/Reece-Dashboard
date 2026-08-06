/**
 * Read layer for the five-tier scorecard.
 *
 * ONE fetch of `lp_report_facts`, rolled up ONCE at the edge (see factRollup —
 * branch rows are folded into markets there and nowhere else), then projected
 * into five independent tiers. Every fetch is individually wrapped: a failing
 * source degrades that tier to "—" with a stated reason and never takes the
 * page down, because a scorecard that 500s teaches people to stop opening it.
 */
import { lpServer } from "@/lib/supabase/lp";
import {
  getTrailingRates,
  rolling90WindowStart,
} from "@/lib/queries/scorecard";
import { firstOfMonthET, todayET } from "@/lib/date/sellingDays";
import { SCORECARD_MARKETS, UTILITY_MARKETS, displayMarketOf } from "@/lib/scorecard/markets";
import type { ReportFactRow } from "@/lib/queries/reportFacts.core";
import { rollupFacts, type RolledFact } from "@/lib/scorecard/tiers/factRollup";
import { buildTier1, type GoalByMarket, type Tier1 } from "@/lib/scorecard/tiers/tier1";
import { buildTier2, type Tier2 } from "@/lib/scorecard/tiers/tier2";
import { buildTier3, type Tier3 } from "@/lib/scorecard/tiers/tier3";
import { buildTier4, type SourceNsliRow, type Tier4 } from "@/lib/scorecard/tiers/tier4";
import { buildTier5, type Tier5 } from "@/lib/scorecard/tiers/tier5";
import { buildDailyView, type DailySnapshotRow, type DailyView } from "@/lib/scorecard/tiers/daily";
import { perUnit, timeToNetByMarket, type JobDateRow, type TimeToNetStat } from "@/lib/scorecard/tiers/metrics";
import { measured, unmeasured, type Measured } from "@/lib/scorecard/tiers/types";

export type TierBundle = {
  rolled: RolledFact[];
  tier1: Tier1;
  tier2: Tier2;
  tier3: Tier3;
  tier4: Tier4;
  tier5: Tier5;
  daily: DailyView;
  timeToNet: { company: TimeToNetStat; markets: TimeToNetStat[]; sampleNote: string };
  /** Rolling-90d planning NSLI — the ONE window the header and editor share. */
  planningNsli: Measured;
  nsliWindowLabel: string;
};

/** Display market codes a tier iterates: 6 markets + UNASSIGNED. */
export const TIER_MARKET_CODES: readonly string[] = [
  ...SCORECARD_MARKETS.map((m) => m.code),
  ...UTILITY_MARKETS.map((m) => m.code),
];

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function fetchFacts(): Promise<RolledFact[]> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_report_facts")
      .select(
        "report_type, period_start, period_end, as_of_date, scope, market, branch_code_raw, metric, bucket, value_cents, value_count",
      )
      .eq("is_current", true)
      .limit(5000);
    if (error) throw new Error(error.message);
    return rollupFacts((data ?? []) as ReportFactRow[]);
  } catch (err) {
    console.error("[tiers] facts fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

async function fetchGoals(): Promise<GoalByMarket> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("scorecard_goals")
      .select("market, goal_mode, monthly_goal_dollars")
      .limit(50);
    if (error) throw new Error(error.message);
    const out: GoalByMarket = {};
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      // Only dollar-mode goals are read straight through; growth-mode goals are
      // resolved against a baseline elsewhere and are not Tier 1's job.
      if (String(r.goal_mode) !== "dollars") continue;
      out[String(r.market)] = num(r.monthly_goal_dollars);
    }
    return out;
  } catch (err) {
    console.error("[tiers] goals fetch failed:", (err as Error)?.message ?? err);
    return {};
  }
}

/**
 * Job-level contract/RTP dates for Time-to-Net.
 *
 * Reads `scorecard_report_rows_a` across ALL snapshots (superseded included —
 * they are never deleted, and an older snapshot may carry a job the current one
 * dropped). `timeToNetByMarket` dedupes by job_number, which is mandatory: the
 * same 30 jobs occupy 214 rows across seven re-ingests.
 */
async function fetchJobDates(): Promise<JobDateRow[]> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("scorecard_report_rows_a")
      .select("job_number, market, contract_date, rtp_date")
      .not("contract_date", "is", null)
      .not("rtp_date", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      job_number: r.job_number == null ? null : String(r.job_number),
      market: String(r.market ?? ""),
      contract_date: r.contract_date == null ? null : String(r.contract_date),
      rtp_date: r.rtp_date == null ? null : String(r.rtp_date),
    }));
  } catch (err) {
    console.error("[tiers] job dates fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * NSLI by source over the rolling 90-day window.
 *
 * `lp_source_scorecard_daily` stores cumulative MTD rows per as-of date, so the
 * final state of each month is the latest as-of within that period_start. Those
 * month-final rows are summed and the rate re-derived — Σnet ÷ Σissued, never
 * the mean of the stored per-row `nsli`, which would weight a 3-lead source the
 * same as a 3,000-lead one.
 */
async function fetchSourceNsli(): Promise<{ rows: SourceNsliRow[]; windowLabel: string }> {
  const windowStart = rolling90WindowStart();
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_source_scorecard_daily")
      .select("source, sub_source, period_start, as_of_date, issued, net_sales")
      .eq("market", "REECE")
      .gte("period_start", windowStart.slice(0, 8) + "01")
      .order("as_of_date", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    // Latest as-of per (source, sub_source, month) — the month's final state.
    const latest = new Map<string, { issued: number; net: number }>();
    const seen = new Map<string, string>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const src = String(r.source ?? "(none)");
      const sub = String(r.sub_source ?? "(none)");
      const month = String(r.period_start ?? "");
      const key = `${src}|${sub}|${month}`;
      const asOf = String(r.as_of_date ?? "");
      const best = seen.get(key);
      if (best && best >= asOf) continue;
      seen.set(key, asOf);
      latest.set(key, { issued: num(r.issued) ?? 0, net: num(r.net_sales) ?? 0 });
    }

    const agg = new Map<string, { source: string; subSource: string; issued: number; net: number }>();
    for (const [key, v] of latest) {
      const [src, sub] = key.split("|");
      const k = `${src}|${sub}`;
      const a = agg.get(k) ?? { source: src!, subSource: sub!, issued: 0, net: 0 };
      a.issued += v.issued;
      a.net += v.net;
      agg.set(k, a);
    }

    const rows: SourceNsliRow[] = [...agg.values()].map((a) => ({
      source: a.source,
      subSource: a.subSource,
      issued: a.issued,
      netSales: Math.round(a.net * 100) / 100,
      nsli: perUnit(a.net, a.issued, "NSLI"),
    }));
    return { rows, windowLabel: `rolling 90d · ${windowStart} → ${todayET()}` };
  } catch (err) {
    console.error("[tiers] source NSLI fetch failed:", (err as Error)?.message ?? err);
    return { rows: [], windowLabel: `rolling 90d · ${windowStart} → ${todayET()}` };
  }
}

async function fetchDaily(): Promise<DailySnapshotRow[]> {
  try {
    const sb = await lpServer();
    const { data, error } = await sb
      .from("lp_market_scorecard_daily")
      .select("market, as_of_date, period_start, leads, raw_leads_in, sets, issued, demos, sales")
      .order("as_of_date", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      market: String(r.market ?? ""),
      as_of_date: String(r.as_of_date ?? ""),
      period_start: String(r.period_start ?? ""),
      leads: num(r.leads),
      raw_leads_in: num(r.raw_leads_in),
      sets: num(r.sets),
      issued: num(r.issued),
      demos: num(r.demos),
      sales: num(r.sales),
    }));
  } catch (err) {
    console.error("[tiers] daily fetch failed:", (err as Error)?.message ?? err);
    return [];
  }
}

/**
 * The rolling-90d planning NSLI — the SAME call the goal editor makes, with the
 * same anchor, so the scorecard header and the editor cannot disagree. Test 12
 * is exactly this: one function, one window, one label.
 */
async function fetchPlanningNsli(market: string): Promise<Measured> {
  try {
    const sb = await lpServer();
    const rates = await getTrailingRates(sb, market, firstOfMonthET());
    return rates.nsli == null
      ? unmeasured("no trailing sales history in the rolling 90-day window yet")
      : measured(rates.nsli);
  } catch (err) {
    console.error("[tiers] planning NSLI failed:", (err as Error)?.message ?? err);
    return unmeasured("trailing rate lookup failed");
  }
}

/** Assemble every tier for one market and one period. */
export async function getTierBundle(
  marketCode: string,
  opts: {
    elapsedSellingDays: number;
    totalSellingDays: number;
    periodLabel: string;
    /** Scope Tier 2's flow reads at: a month view wants mtd, a year view ytd. */
    flowScope: "mtd" | "ytd";
  },
): Promise<TierBundle> {
  const [rolled, goals, jobDates, sourceNsli, dailyRows, planningNsli] = await Promise.all([
    fetchFacts(),
    fetchGoals(),
    fetchJobDates(),
    fetchSourceNsli(),
    fetchDaily(),
    fetchPlanningNsli(marketCode),
  ]);

  const ttnRaw = timeToNetByMarket(jobDates, displayMarketOf);
  const timeToNet = {
    ...ttnRaw,
    sampleNote:
      ttnRaw.company.n > 0
        ? `${ttnRaw.company.n} distinct jobs with both a contract date and an RTP date. Job-level rows exist only for the Jobs-by-Milestone report, so this is that cohort — not a year-to-date population.`
        : "no job-level rows carry both a contract date and an RTP date yet",
  };

  return {
    rolled,
    tier1: buildTier1(rolled, goals, {
      elapsedSellingDays: opts.elapsedSellingDays,
      totalSellingDays: opts.totalSellingDays,
      periodLabel: opts.periodLabel,
    }),
    tier2: buildTier2(rolled, {
      scope: opts.flowScope,
      markets: TIER_MARKET_CODES,
      periodLabel: opts.periodLabel,
    }),
    tier3: buildTier3(rolled, timeToNet, { market: marketCode }),
    tier4: buildTier4(rolled, sourceNsli.rows, {
      markets: TIER_MARKET_CODES,
      sourceWindowLabel: sourceNsli.windowLabel,
      planningNsli,
      nsliWindowLabel: `rolling 90d · from ${rolling90WindowStart()}`,
    }),
    tier5: buildTier5(rolled, marketCode),
    daily: buildDailyView(dailyRows),
    timeToNet,
    planningNsli,
    nsliWindowLabel: `rolling 90d · from ${rolling90WindowStart()}`,
  };
}
