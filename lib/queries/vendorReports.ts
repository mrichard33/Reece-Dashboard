import { lpService } from "@/lib/supabase/lp";
import { isMissingColumn, isMissingRelation } from "@/lib/queries/pgErrors";
import {
  toItems,
  type SendLogRow,
  type VendorConfigRow,
  type VendorReportsPageData,
} from "@/lib/queries/vendorReports.core";

export { VDR_MIGRATION, type VendorReportsPageData, type VendorItem } from "@/lib/queries/vendorReports.core";

/**
 * /vendor-reports reads (2026-10-14). LP Supabase through the service client.
 * `vdr_vendor_config` and `vdr_send_log` belong to the n8n "06 VDR" workflow
 * (tables in LP-MCP migration 20261013230000_vdr_vendor_disposition_report);
 * the dashboard edits the config rows and only reads the log.
 *
 * A missing table returns `needsMigration` and the page names the file,
 * rather than rendering an empty list that reads as "no vendors".
 */
export async function getVendorReportsPageData(): Promise<VendorReportsPageData> {
  const empty: VendorReportsPageData = { items: [], needsMigration: false, errors: {} };

  let sb;
  try {
    sb = lpService();
  } catch (err) {
    return { ...empty, errors: { config: err instanceof Error ? err.message : String(err) } };
  }

  const { data, error } = await sb.from("vdr_vendor_config").select("*");
  if (error) {
    const notThere =
      isMissingRelation(error) ||
      isMissingColumn(error) ||
      error.code === "PGRST205" ||
      /Could not find the table|schema cache/i.test(error.message ?? "");
    if (notThere) return { ...empty, needsMigration: true };
    return { ...empty, errors: { config: error.message } };
  }
  const config = (data ?? []) as VendorConfigRow[];

  // The newest rows are enough for "last run" per vendor: one pass writes one
  // row per vendor, at most 3 passes a week, so 200 rows cover weeks.
  const errors: Record<string, string> = {};
  let log: SendLogRow[] = [];
  const { data: logData, error: logErr } = await sb
    .from("vdr_send_log")
    .select("id, vendor_id, vendor_name, week_start, status, lead_count, reason, dry_run, attempted_at")
    .order("id", { ascending: false })
    .limit(200);
  if (logErr) errors.log = logErr.message;
  else log = (logData ?? []) as SendLogRow[];

  return { items: toItems(config, log), needsMigration: false, errors };
}
