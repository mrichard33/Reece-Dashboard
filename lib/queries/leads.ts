import { lpService } from "@/lib/supabase/lp";
import type {
  Cursor,
  FeedPage,
  LeadLite,
  LpActivity,
  LpCallLog,
  LpNote,
} from "@/lib/supabase/types";

/**
 * Per-lead feeds (call history / notes / activities) against LP Supabase.
 *
 * Three read-I/O patterns are baked in here from the start:
 *   #4 — projected columns (never `select('*')`, never the `raw_lp_data` blob)
 *   #3 — no exact count: fetch PAGE_SIZE + 1 rows and derive `hasMore`, so we
 *        never make PostgREST wrap the query in a whole-set count CTE per page
 *   #2 — keyset (cursor) pagination instead of OFFSET, so cost is O(1) per page
 *        regardless of depth. Maps to the (lp_lead_id, <date> DESC) indexes.
 */

export const FEED_PAGE_SIZE = 25;

export type FeedType = "calls" | "notes" | "activities";

// Trimmed lp_leads projection for the lead header — same shape as activity.ts.
const LEAD_LITE_COLUMNS =
  "lp_lead_id, lp_prospect_id, ghl_contact_id, first_name, last_name, phone, email, lead_source, lead_source_detail, rep_name, disposition_label, appointment_set, demo_completed, job_value";

// Every column except `raw_lp_data` (jsonb blob in TOAST — never rendered).
const LP_CALL_COLUMNS =
  "id, lp_call_id, lp_lead_id, ghl_contact_id, call_date, call_duration_sec, call_result, call_direction, rep_id, rep_name, call_notes, recording_url, synced_at, agent_id, agent_name";
const LP_NOTE_COLUMNS =
  "id, lp_note_id, lp_lead_id, ghl_contact_id, note_body, note_type, created_by_rep_id, created_by_rep_name, created_at_lp, synced_at, note_category, ghl_note_pushed";
const LP_ACTIVITY_COLUMNS =
  "id, lp_activity_id, lp_lead_id, activity_type, activity_detail, rep_id, rep_name, activity_date, synced_at";

type FeedConfig = { table: string; columns: string; dateCol: string };

const FEEDS: Record<FeedType, FeedConfig> = {
  calls: { table: "lp_call_logs", columns: LP_CALL_COLUMNS, dateCol: "call_date" },
  notes: { table: "lp_notes", columns: LP_NOTE_COLUMNS, dateCol: "created_at_lp" },
  activities: {
    table: "lp_activities",
    columns: LP_ACTIVITY_COLUMNS,
    dateCol: "activity_date",
  },
};

/** Lead header for the detail page title / contact summary. No `select('*')`. */
export async function getLeadHeader(leadId: string): Promise<LeadLite | null> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("lp_leads")
      .select(LEAD_LITE_COLUMNS)
      .eq("lp_lead_id", leadId)
      .maybeSingle();
    return (data as LeadLite | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Generic keyset page. Orders by `(<date> DESC, id DESC)` — the `id` uuid is a
 * deterministic tiebreaker so page boundaries never duplicate or skip a row.
 * When a cursor is supplied, the `.or()` reproduces the row-value comparison
 * `(date, id) < (cursor.date, cursor.id)`.
 */
async function fetchKeysetPage<T extends { id: string }>(
  type: FeedType,
  leadId: string,
  cursor: Cursor,
): Promise<FeedPage<T>> {
  const { table, columns, dateCol } = FEEDS[type];
  try {
    const sb = lpService();
    let q = sb
      .from(table)
      .select(columns)
      .eq("lp_lead_id", leadId)
      .not(dateCol, "is", null)
      .order(dateCol, { ascending: false })
      .order("id", { ascending: false })
      .limit(FEED_PAGE_SIZE + 1);

    if (cursor) {
      // (date < last) OR (date = last AND id < lastId). `cursor.lastDate` is a
      // UTC `Z` ISO string (no `+`), so it survives the un-encoded .or() filter.
      q = q.or(
        `${dateCol}.lt.${cursor.lastDate},and(${dateCol}.eq.${cursor.lastDate},id.lt.${cursor.lastId})`,
      );
    }

    const { data } = await q;
    const all = (data ?? []) as unknown as T[];
    const hasMore = all.length > FEED_PAGE_SIZE;
    const rows = hasMore ? all.slice(0, FEED_PAGE_SIZE) : all;

    const last = rows[rows.length - 1];
    const nextCursor: Cursor =
      hasMore && last
        ? {
            lastDate: new Date(
              (last as Record<string, unknown>)[dateCol] as string,
            ).toISOString(),
            lastId: last.id,
          }
        : null;

    return { rows, nextCursor };
  } catch {
    return { rows: [], nextCursor: null };
  }
}

export function getLeadCalls(leadId: string, cursor: Cursor = null): Promise<FeedPage<LpCallLog>> {
  return fetchKeysetPage<LpCallLog>("calls", leadId, cursor);
}

export function getLeadNotes(leadId: string, cursor: Cursor = null): Promise<FeedPage<LpNote>> {
  return fetchKeysetPage<LpNote>("notes", leadId, cursor);
}

export function getLeadActivities(
  leadId: string,
  cursor: Cursor = null,
): Promise<FeedPage<LpActivity>> {
  return fetchKeysetPage<LpActivity>("activities", leadId, cursor);
}
