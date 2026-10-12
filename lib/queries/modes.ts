import { lpService } from "@/lib/supabase/lp";
import { isMissingColumn, isMissingRelation } from "@/lib/queries/pgErrors";
import {
  sortModes,
  toModeItems,
  type FeatureModeRow,
  type ModeChangeRow,
  type ModesPageData,
} from "@/lib/queries/modes.core";

export { FEATURE_MODES_MIGRATION, type ModesPageData } from "@/lib/queries/modes.core";

/**
 * /modes reads (Fix 2, 2026-10-12). LP Supabase through the service client,
 * read-only. LP-MCP writes `feature_modes` at every boot; its trigger writes
 * `feature_mode_changes` when a flag's value changes. Nothing here changes a
 * flag: a flip is a Railway variable a person sets.
 *
 * The tables ship in an LP-MCP migration that may not be applied when this
 * deploys, so a missing table returns `needsMigration` and the page names the
 * file, rather than rendering an empty list that reads as "no flags".
 */

const WEEK_MS = 7 * 86_400_000;

export async function getModesPageData(nowMs: number = Date.now()): Promise<ModesPageData> {
  const empty: ModesPageData = { items: [], changes: [], needsMigration: false, registeredAt: null, errors: {} };

  let sb;
  try {
    sb = lpService();
  } catch (err) {
    return { ...empty, errors: { modes: err instanceof Error ? err.message : String(err) } };
  }

  const { data, error } = await sb.from("feature_modes").select("*");
  if (error) {
    // PostgREST reports a table it has never seen as PGRST205 "Could not find
    // the table … in the schema cache", not Postgres's 42P01 (same as
    // lib/queries/payroll.ts:96).
    const notThere =
      isMissingRelation(error) ||
      isMissingColumn(error) ||
      error.code === "PGRST205" ||
      /Could not find the table|schema cache/i.test(error.message ?? "");
    if (notThere) return { ...empty, needsMigration: true };
    return { ...empty, errors: { modes: error.message } };
  }
  const rows = (data ?? []) as FeatureModeRow[];
  const errors: Record<string, string> = {};

  // Shadow events in the last 7 days, only for flags whose shadow decisions
  // are recorded as system_events (idx_se_type covers event_type + created_at).
  const since = new Date(nowMs - WEEK_MS).toISOString();
  const withEvents = rows.filter((r) => r.current_state === "shadow" && r.evidence?.events?.length);
  const counts: Record<string, number> = {};
  await Promise.all(
    withEvents.map(async (r) => {
      const { count, error: e } = await sb
        .from("system_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", r.evidence!.events!)
        .gte("created_at", since);
      if (e) errors.events = e.message;
      else counts[r.name] = count ?? 0;
    }),
  );

  let changes: ModeChangeRow[] = [];
  const ch = await sb
    .from("feature_mode_changes")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(20);
  if (ch.error) errors.changes = ch.error.message;
  else changes = (ch.data ?? []) as ModeChangeRow[];

  const registeredAt = rows.reduce<string | null>(
    (max, r) => (max === null || r.registered_at > max ? r.registered_at : max),
    null,
  );

  return { items: sortModes(toModeItems(rows, nowMs, counts)), changes, needsMigration: false, registeredAt, errors };
}
