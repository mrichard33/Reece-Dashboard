import { lpService } from "@/lib/supabase/lp";
import { isMissingRelation } from "@/lib/queries/pgErrors";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import {
  shapeCostView,
  shapeTrend,
  shapeInvoices,
  COMPANY_MARKET,
  type CostRowRaw,
  type CostView,
  type TrendPoint,
  type InvoiceDoc,
  type InvoiceDocRaw,
} from "./marketingCost.core";

export * from "./marketingCost.core";

/**
 * Marketing cost reads — LP's `v_market_subsource_cost` (LP-MCP sql/158) and
 * the invoice ledger. Service-role client: the ledger tables carry no RLS
 * policy for the dashboard role, and nothing here is per-user.
 *
 * `needsMigration` is set when the view does not exist yet (sql/158 not
 * applied), so the tab says so instead of showing an empty table as "$0".
 */

export type MarketingCostResult = { view: CostView | null; needsMigration: boolean; error: string | null };

async function readView(filter: { grain: "month" | "iso_week"; from: string; to: string }): Promise<{ rows: CostRowRaw[]; needsMigration: boolean; error: string | null }> {
  const sb = lpService();
  try {
    const rows = await fetchAllPages<CostRowRaw>("v_market_subsource_cost", (from, to) =>
      sb.from("v_market_subsource_cost").select("*").eq("grain", filter.grain).gte("period_start", filter.from).lte("period_start", filter.to)
        .order("period_start").order("market").order("lp_sub_source").range(from, to),
    );
    return { rows, needsMigration: false, error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (isMissingRelation(e)) return { rows: [], needsMigration: true, error: null };
    return { rows: [], needsMigration: false, error: e?.message ?? String(err) };
  }
}

/** Monday of the ISO week containing d (YYYY-MM-DD). */
function isoWeekStart(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt.toISOString().slice(0, 10);
}

export async function getMarketingCost({
  market = COMPANY_MARKET, grain = "month", periodStart, periodEnd,
}: { market?: string; grain?: "month" | "week"; periodStart: string; periodEnd: string }): Promise<MarketingCostResult> {
  const from = grain === "week" ? isoWeekStart(periodStart) : `${periodStart.slice(0, 7)}-01`;
  const r = await readView({ grain: grain === "week" ? "iso_week" : "month", from, to: periodEnd });
  if (r.needsMigration || r.error) return { view: null, needsMigration: r.needsMigration, error: r.error };
  return { view: shapeCostView(r.rows, { market, grain, periodStart: from, periodEnd }), needsMigration: false, error: null };
}

export async function getMarketingCostTrend(market = COMPANY_MARKET, through: string): Promise<TrendPoint[]> {
  const end = `${through.slice(0, 7)}-01`;
  const start = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);
  const r = await readView({ grain: "month", from: start, to: end });
  return r.rows.length ? shapeTrend(r.rows, market) : [];
}

export async function getRecentInvoices(limit = 40): Promise<{ docs: InvoiceDoc[]; needsMigration: boolean }> {
  const sb = lpService();
  const { data, error } = await sb.from("marketing_invoice_documents")
    .select("id, status, from_address, subject, received_at, file_name, analyzer, analysis, extracted_text, storage_path, created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMissingRelation(error)) return { docs: [], needsMigration: true };
    throw new Error(error.message);
  }
  const { data: vendors } = await sb.from("marketing_vendors").select("id, vendor_name");
  const names: Record<string, string> = {};
  for (const v of (vendors ?? []) as { id: string; vendor_name: string }[]) names[v.id] = v.vendor_name;
  return { docs: shapeInvoices((data ?? []) as InvoiceDocRaw[], names), needsMigration: false };
}

/** The held expense rows (REECE_HOLD) of a month, for the "Apply recommendation" button. */
export async function getHeldExpenses(periodStart: string, periodEnd: string): Promise<{ id: string; description: string; amount: number; recommended_market: string | null; recommendation_reason: string | null }[]> {
  const sb = lpService();
  const { data, error } = await sb.from("marketing_expense_allocations")
    .select("expense_id, amount, recommended_market, recommendation_reason, month, marketing_expenses!inner(id, description, status)")
    .eq("market", "REECE_HOLD").eq("rule", "hold").gte("month", `${periodStart.slice(0, 7)}-01`).lte("month", periodEnd)
    .order("amount", { ascending: false }).limit(100);
  if (error) return [];
  return ((data ?? []) as unknown as { expense_id: string; amount: string; recommended_market: string | null; recommendation_reason: string | null; marketing_expenses: { description: string | null; status: string } }[])
    .filter((r) => r.marketing_expenses?.status === "approved")
    .map((r) => ({ id: r.expense_id, description: r.marketing_expenses?.description ?? "", amount: Number(r.amount) || 0, recommended_market: r.recommended_market, recommendation_reason: r.recommendation_reason }));
}

/** 7-day signed link to the latest Brad-format XLSX for a market (REECE = company). */
export async function latestReportUrl(market = COMPANY_MARKET): Promise<string | null> {
  const sb = lpService();
  const { data: folders } = await sb.storage.from("marketing-reports").list("", { limit: 100, sortBy: { column: "name", order: "desc" } });
  for (const f of folders ?? []) {
    if (!/^\d{4}-\d{2}$/.test(f.name)) continue;
    const path = `${f.name}/${market}.xlsx`;
    const { data } = await sb.storage.from("marketing-reports").createSignedUrl(path, 7 * 24 * 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}
