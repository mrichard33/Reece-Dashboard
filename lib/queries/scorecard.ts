import { lpService } from "@/lib/supabase/lp";
import { periodDays, prorateGoalCalendar } from "@/lib/time";

/**
 * Goal/variance scorecard read layer — v2.
 *
 * v2 aggregates ACTUALS for an arbitrary window directly from the fresh LP cache
 * (`lp_leads` for the funnel counts, `lp_jobs` / `lp_job_milestones` for the $
 * buckets), so the page can serve any period (day/week/month/quarter/YTD/custom)
 * — it no longer reads the single precomputed MTD row from
 * `lp_market_scorecard_daily`. Goal columns, per-day pace targets, and the
 * variance bridge are still derived HERE, at read time, from the editable
 * `scorecard_goals` table, so an admin's goal edit takes effect immediately.
 *
 * ⚠ CORRECTED funnel definitions (review audit over 214K rows):
 *   - `sets`  = lp_leads.appointment_set  (audited accurate)
 *   - `demos` = lp_leads.demo_completed   (audited accurate)
 *   - `sales` = lp_leads.closed_won       (audited accurate — NOT job_value>0)
 *   - Close% = sales / demos              (real, trustworthy)
 *   - "Leads (Issued)" is the report's ISSUED/worked count. The cache has no
 *     issued dimension (appointment_set is *Set*, not Issue), so `issued` is
 *     null → rendered "—". Faithful issued needs LP's issued field (GetLead bit
 *     16384) added to the cache (deferred). Any rate whose denominator is issued
 *     (the report's Demo% = Demo ÷ Issue) is therefore null too.
 *   - There is NO `market` column on lp_leads — do not filter by it. `market` is
 *     a label / future-grouping key only.
 *
 * ⚠ TIE-OUT: good_business, net_sales, NSLI, KO%, the pace targets and the
 * variance bridge are LP-internal/provisional definitions until reconciled to a
 * real Reece export (§4, deferred). `reconciled` drives the PROVISIONAL banner.
 *
 * $ BUCKETS: the lp_jobs / lp_job_milestones schema could not be verified when
 * this was written, so the aggregation degrades gracefully — any error reading
 * those tables yields null buckets plus a `warnings[]` entry (rendered "—"),
 * never a crash. Assumed columns are centralised in JOBS_SCHEMA below; adjust
 * there once the cache is confirmed.
 */

export type ScorecardActuals = {
  market: string;
  period_start: string;
  period_end: string;
  days_elapsed: number;
  // Funnel counts (lp_leads).
  /** Issued/worked leads — NOT in the cache yet → null → "—". */
  issued: number | null;
  sets: number;
  demos: number;
  sales: number;
  /** ⚠ provisional — no verified KO flag in the cache. */
  ko_count: number | null;
  // $ buckets (lp_jobs / lp_job_milestones) — null when unavailable.
  good_business: number | null;
  gross_sales: number | null;
  net_sales: number | null;
  pending_dollars: number | null;
  deposits: number | null;
  inventory_jobs: number | null;
  inventory_due: number | null;
  // Rates.
  /** report Demo% = demos ÷ issued → null (issued unavailable). */
  demo_pct: number | null;
  /** sales ÷ demos — real. */
  close_pct: number | null;
  good_rate_pct: number | null;
  ko_pct: number | null;
  nsli: number | null;
  avg_sale: number | null;
  reconciled: boolean;
};

export type ScorecardGoals = {
  market: string;
  monthly_goal_dollars: number;
  working_days: number;
  target_close_pct: number;
  target_good_rate_pct: number;
  target_demo_pct: number;
  target_ko_pct: number;
  trailing_nsli: number;
  /** Optional: when present and true, clears the PROVISIONAL banner (§4). */
  reconciled?: boolean | null;
  updated_by: string | null;
  updated_at: string;
};

export type ScorecardDerived = {
  monthly_goal_dollars: number;
  /** $ goal prorated (calendar-days) to the selected window. */
  period_goal_dollars: number;
  /** monthly_goal ÷ working_days — the daily goal rate. */
  goal_per_day: number;
  /** good_business ÷ days_elapsed — actual $/day (null if no good_business). */
  per_day_actual: number | null;
  /** window run-rate projected to a full month of working days. */
  projected_good_business: number | null;
  /** period_goal − good_business (null-safe). */
  balance: number | null;
  /** monthly_goal − projected_good_business. */
  projected_balance: number | null;
  // ⚠ TIE-OUT pace targets (goal $ ÷ trailing NSLI ÷ working days, then funnel %)
  target_issued_per_day: number | null;
  target_demoed_per_day: number | null;
  target_closed_per_day: number | null;
  actual_issued_per_day: number | null;
  actual_demoed_per_day: number;
  actual_closed_per_day: number;
  // ⚠ TIE-OUT variance bridge — dollarized + per-metric point gaps vs goal.
  variance: {
    dollars: number | null;
    close_pts: number | null;
    demo_pts: number | null;
    good_rate_pts: number | null;
    ko_pts: number | null;
  };
  reconciled: boolean;
};

export type ScorecardView = {
  actuals: ScorecardActuals;
  goals: ScorecardGoals;
  derived: ScorecardDerived;
  /** Non-fatal data-availability notes (e.g. lp_jobs unavailable). */
  warnings: string[];
  /** Most recent lp_leads.synced_at — cache freshness for the provenance line. */
  lastSyncedAt: string | null;
};

const DEFAULT_GOALS = (market: string): ScorecardGoals => ({
  market,
  monthly_goal_dollars: 0,
  working_days: 26,
  target_close_pct: 30,
  target_good_rate_pct: 70,
  target_demo_pct: 70,
  target_ko_pct: 10,
  trailing_nsli: 0,
  reconciled: false,
  updated_by: null,
  updated_at: new Date(0).toISOString(),
});

/**
 * Verified lp_jobs shape (2026-06). lp_jobs exposes a single `job_value` (no
 * gross/net/remaining split) and a `job_status` text, so the $ buckets key off
 * those two columns. ⚠ The status groupings below are provisional — final
 * definitions are §4 (reconciliation), still pending. lp_job_milestones carries
 * only DATE milestones (no $ amount), so Deposits is not derivable from the
 * cache and is reported as "—" rather than guessed.
 */
const JOBS_SCHEMA = {
  jobsTable: "lp_jobs",
  jobDateCol: "created_at_lp",
  jobStatusCol: "job_status",
  jobValueCol: "job_value",
  // Lost — excluded from gross.
  deadStatuses: ["Cancelled", "Dead Deal", "Credit Decline", "Cancelled By Mgt"],
  // Realized / paid.
  netStatuses: ["Paid In Full", "PIF Survey Ready", "PIF NO Survey", "Assumed Complete"],
} as const;

const PAGE = 1000;

function pts(actual: number | null, target: number | null): number | null {
  if (actual == null || target == null) return null;
  return Math.round((actual - target) * 10) / 10;
}

function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // one-decimal %
}

/** Head-count of lp_leads rows in [start,end) matching an optional boolean flag. */
async function countLeads(
  start: string,
  end: string,
  flag?: "appointment_set" | "demo_completed" | "closed_won",
): Promise<number> {
  const sb = lpService();
  let q = sb
    .from("lp_leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at_lp", start)
    .lt("created_at_lp", end);
  if (flag) q = q.eq(flag, true);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

type JobsBuckets = {
  gross_sales: number;
  net_sales: number;
  pending_dollars: number;
  inventory_jobs: number;
  inventory_due: number;
};

/**
 * Sum the $ buckets from lp_jobs (signed in the window), paginating by id keyset
 * to defeat the 1000-row PostgREST cap on wide windows. Only `job_value` exists,
 * so: gross = Σ value of live (non-dead) jobs; net = Σ value of realized/paid
 * jobs; the live-but-unpaid remainder is the in-production backlog (count =
 * inventory_jobs, value = inventory_due ≈ pending). ⚠ provisional groupings.
 * Throws on any schema/column mismatch so the caller can degrade to a warning.
 */
async function sumJobsBuckets(start: string, end: string): Promise<JobsBuckets> {
  const sb = lpService();
  const cols = `id, ${JOBS_SCHEMA.jobStatusCol}, ${JOBS_SCHEMA.jobValueCol}`;
  const dead = JOBS_SCHEMA.deadStatuses as readonly string[];
  const net = JOBS_SCHEMA.netStatuses as readonly string[];
  const out: JobsBuckets = {
    gross_sales: 0,
    net_sales: 0,
    pending_dollars: 0,
    inventory_jobs: 0,
    inventory_due: 0,
  };
  let after: string | null = null;
  for (;;) {
    let q = sb
      .from(JOBS_SCHEMA.jobsTable)
      .select(cols)
      .gte(JOBS_SCHEMA.jobDateCol, start)
      .lt(JOBS_SCHEMA.jobDateCol, end)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    for (const r of rows) {
      const status = String(r[JOBS_SCHEMA.jobStatusCol] ?? "");
      const value = Number(r[JOBS_SCHEMA.jobValueCol] ?? 0) || 0;
      if (dead.includes(status)) continue; // lost — not gross
      out.gross_sales += value;
      if (net.includes(status)) {
        out.net_sales += value;
      } else {
        // Live, signed, not yet realized → in-production backlog.
        out.pending_dollars += value;
        out.inventory_jobs += 1;
        out.inventory_due += value;
      }
    }
    if (rows.length < PAGE) break;
    after = String(rows[rows.length - 1]?.id ?? "");
  }
  return out;
}

/** Most recent lp_leads.synced_at — cache freshness for the provenance line. */
async function latestSync(): Promise<string | null> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("lp_leads")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { synced_at?: string } | null)?.synced_at ?? null;
  } catch {
    return null;
  }
}

function derive(
  actuals: ScorecardActuals,
  goals: ScorecardGoals,
  period_goal_dollars: number,
): ScorecardDerived {
  const wd = goals.working_days || 1;
  const elapsed = actuals.days_elapsed || 1;
  const goal_per_day = goals.monthly_goal_dollars / wd;

  const per_day_actual =
    actuals.good_business == null ? null : Math.round(actuals.good_business / elapsed);
  const projected_good_business =
    per_day_actual == null ? null : Math.round(per_day_actual * wd);
  const balance =
    actuals.good_business == null ? null : Math.round(period_goal_dollars - actuals.good_business);
  const projected_balance =
    projected_good_business == null ? null : Math.round(goals.monthly_goal_dollars - projected_good_business);

  // ⚠ TIE-OUT: target issued/day = monthly goal $ ÷ trailing NSLI ÷ working days.
  const target_issued_total = goals.trailing_nsli > 0 ? goals.monthly_goal_dollars / goals.trailing_nsli : null;
  const target_issued_per_day =
    target_issued_total != null ? Math.round((target_issued_total / wd) * 10) / 10 : null;
  const target_demoed_per_day =
    target_issued_per_day != null
      ? Math.round(target_issued_per_day * (goals.target_demo_pct / 100) * 10) / 10
      : null;
  const target_closed_per_day =
    target_demoed_per_day != null
      ? Math.round(target_demoed_per_day * (goals.target_close_pct / 100) * 10) / 10
      : null;

  return {
    monthly_goal_dollars: goals.monthly_goal_dollars,
    period_goal_dollars,
    goal_per_day: Math.round(goal_per_day),
    per_day_actual,
    projected_good_business,
    balance,
    projected_balance,
    target_issued_per_day,
    target_demoed_per_day,
    target_closed_per_day,
    actual_issued_per_day:
      actuals.issued == null ? null : Math.round((actuals.issued / elapsed) * 10) / 10,
    actual_demoed_per_day: Math.round((actuals.demos / elapsed) * 10) / 10,
    actual_closed_per_day: Math.round((actuals.sales / elapsed) * 10) / 10,
    variance: {
      dollars: actuals.net_sales == null ? null : Math.round(actuals.net_sales - period_goal_dollars),
      close_pts: pts(actuals.close_pct, goals.target_close_pct),
      demo_pts: pts(actuals.demo_pct, goals.target_demo_pct),
      good_rate_pts: pts(actuals.good_rate_pct, goals.target_good_rate_pct),
      ko_pts: pts(actuals.ko_pct, goals.target_ko_pct),
    },
    reconciled: actuals.reconciled,
  };
}

/**
 * Aggregate the scorecard for `market` over the window [period.start, period.end)
 * (ISO instants), join the editable goals, and derive goal/pace/variance at read
 * time. Returns null only if the leads counts themselves cannot be read.
 */
export async function getScorecard(
  market = "REECE",
  period: { start: string; end: string },
): Promise<ScorecardView | null> {
  const warnings: string[] = [];

  // Funnel counts from lp_leads (corrected definitions). Fail closed if these
  // can't be read — there's nothing to show without them.
  let sets = 0;
  let demos = 0;
  let sales = 0;
  try {
    [sets, demos, sales] = await Promise.all([
      countLeads(period.start, period.end, "appointment_set"),
      countLeads(period.start, period.end, "demo_completed"),
      countLeads(period.start, period.end, "closed_won"),
    ]);
  } catch (err) {
    console.error("[scorecard] lp_leads aggregation failed", err);
    return null;
  }

  // $ buckets — degrade gracefully if lp_jobs is absent or its schema differs.
  let buckets: JobsBuckets | null = null;
  try {
    buckets = await sumJobsBuckets(period.start, period.end);
  } catch {
    warnings.push("Job $ buckets unavailable (lp_jobs not found or schema differs) — Gross/Net/Pending/Inventory show —.");
  }
  // Deposit $ is not tracked in the cache: lp_job_milestones holds date
  // milestones only (no amount). Reported as "—" pending an LP enrichment.
  const deposits: number | null = null;
  warnings.push("Deposit $ not in the cache (job milestones are date-type only) — Deposits show —.");

  const [goalsRow, lastSyncedAt] = await Promise.all([
    lpService()
      .from("scorecard_goals")
      .select("*")
      .eq("market", market)
      .maybeSingle()
      .then((r) => r.data as ScorecardGoals | null),
    latestSync(),
  ]);
  const goals = goalsRow ?? DEFAULT_GOALS(market);

  const days_elapsed = periodDays(new Date(period.start), new Date(period.end));
  const gross_sales = buckets?.gross_sales ?? null;
  const net_sales = buckets?.net_sales ?? null;
  // ⚠ good_business has no reconciled definition yet (§4) — leave provisional/null.
  const good_business: number | null = null;

  const actuals: ScorecardActuals = {
    market,
    period_start: period.start,
    period_end: period.end,
    days_elapsed,
    issued: null, // ⚠ cache has no issued dimension — see header comment.
    sets,
    demos,
    sales,
    ko_count: null,
    good_business,
    gross_sales,
    net_sales,
    pending_dollars: buckets?.pending_dollars ?? null,
    deposits,
    inventory_jobs: buckets?.inventory_jobs ?? null,
    inventory_due: buckets?.inventory_due ?? null,
    demo_pct: null, // report Demo% = demos ÷ issued; issued unavailable.
    close_pct: rate(sales, demos), // sales ÷ demos — real.
    good_rate_pct: rate(good_business, gross_sales), // provisional
    ko_pct: null,
    nsli: null, // NSLI = net ÷ issued; issued unavailable.
    avg_sale: gross_sales != null && sales > 0 ? Math.round(gross_sales / sales) : null,
    reconciled: goals.reconciled === true,
  };

  const period_goal_dollars = prorateGoalCalendar(
    new Date(period.start),
    new Date(period.end),
    goals.monthly_goal_dollars,
  );

  return {
    actuals,
    goals,
    derived: derive(actuals, goals, period_goal_dollars),
    warnings,
    lastSyncedAt,
  };
}

/** The editable goal row for a market (for the admin editor). */
export async function getScorecardGoals(market = "REECE"): Promise<ScorecardGoals> {
  const sb = lpService();
  const { data } = await sb
    .from("scorecard_goals")
    .select("*")
    .eq("market", market)
    .maybeSingle();
  return (data as ScorecardGoals | null) ?? DEFAULT_GOALS(market);
}
