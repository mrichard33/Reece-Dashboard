import { lpService } from "@/lib/supabase/lp";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import { isMissingRelation, type PgError } from "@/lib/queries/pgErrors";
import {
  LEAK_REASONS,
  shapeIntake,
  shapeLeaks,
  shapeSpeed,
  type IntakeRowRaw,
  type IntakeView,
  type LeakRowRaw,
  type LeaksView,
  type SpeedRowRaw,
  type SpeedView,
} from "@/lib/queries/leadLeaks.core";

/**
 * /lead-leaks reads — the three tables LP-MCP's Lead Leak Monitor writes each
 * morning at 07:00 ET (sql/130 + sql/131). Each section loads on its own: one
 * missing table or failed read must not blank the other two, and a table that
 * does not exist yet renders "needs migration" rather than a confident zero
 * (lib/queries/pgErrors.ts — a zero that means "nothing to do" and a zero that
 * means "not set up" must never look the same).
 */

export type Section<T> =
  | { state: "ok"; data: T; runDate: string | null }
  | { state: "missing"; migration: string }
  | { state: "empty" }
  | { state: "error"; message: string };

const BUSINESS_TZ = "America/New_York";

/** Today's ET date, YYYY-MM-DD. */
export function todayEt(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(at);
}

function classify(error: PgError, migration: string): Section<never> | null {
  if (!error) return null;
  if (isMissingRelation(error)) return { state: "missing", migration };
  return { state: "error", message: error.message ?? "read failed" };
}

/** The newest `run_date` in a per-run table, or null when it is empty. */
async function latestRunDate(table: string): Promise<{ runDate: string | null; error: PgError }> {
  const { data, error } = await lpService()
    .from(table)
    .select("run_date")
    .order("run_date", { ascending: false })
    .limit(1);
  return { runDate: (data?.[0] as { run_date?: string } | undefined)?.run_date ?? null, error };
}

export async function getLeaksSection(nowMs = Date.now()): Promise<Section<LeaksView>> {
  try {
    const { runDate, error } = await latestRunDate("lead_leak_daily");
    const bad = classify(error, "sql/130");
    if (bad) return bad;
    if (!runDate) return { state: "empty" };
    const rows = await fetchAllPages<LeakRowRaw>("lead-leaks: lead_leak_daily", (from, to) =>
      lpService()
        .from("lead_leak_daily")
        .select("lp_lead_id,lead_source,disposition,reason,est_value,detail")
        .eq("run_date", runDate)
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { state: "ok", data: shapeLeaks(rows, nowMs), runDate };
  } catch (err) {
    return { state: "error", message: (err as Error).message };
  }
}

export async function getSpeedSection(): Promise<Section<SpeedView>> {
  try {
    const today = todayEt();
    const since = new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await lpService()
      .from("lead_call_speed_daily")
      .select("created_day,leads,expected,called,never_called,called_1h,called_24h,median_min,p90_min")
      .gte("created_day", since)
      .order("created_day", { ascending: true });
    const bad = classify(error, "sql/131");
    if (bad) return bad;
    const rows = (data ?? []) as SpeedRowRaw[];
    if (!rows.length) return { state: "empty" };
    return { state: "ok", data: shapeSpeed(rows, today), runDate: rows.at(-1)?.created_day ?? null };
  } catch (err) {
    return { state: "error", message: (err as Error).message };
  }
}

export async function getIntakeSection(): Promise<Section<IntakeView>> {
  try {
    const { runDate, error } = await latestRunDate("lead_intake_gap_daily");
    const bad = classify(error, "sql/131");
    if (bad) return bad;
    if (!runDate) return { state: "empty" };
    const rows = await fetchAllPages<IntakeRowRaw>("lead-leaks: lead_intake_gap_daily", (from, to) =>
      lpService()
        .from("lead_intake_gap_daily")
        .select("ghl_contact_id,first_name,last_name,phone10,source,date_added,class")
        .eq("run_date", runDate)
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { state: "ok", data: shapeIntake(rows), runDate };
  } catch (err) {
    return { state: "error", message: (err as Error).message };
  }
}

/**
 * The one number the Overview tile shows: leads never called on the latest
 * run. Same table and same leak definition as the page — no second path.
 */
export async function getLeadsNotCalledCount(): Promise<number | null> {
  try {
    const { runDate, error } = await latestRunDate("lead_leak_daily");
    if (error) return null;
    if (!runDate) return 0;
    const { count, error: countErr } = await lpService()
      .from("lead_leak_daily")
      .select("id", { count: "exact", head: true })
      .eq("run_date", runDate)
      .in("reason", [...LEAK_REASONS]);
    return countErr ? null : (count ?? 0);
  } catch {
    return null;
  }
}
