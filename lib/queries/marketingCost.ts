import { lpService } from "@/lib/supabase/lp";
import { isMissingRelation } from "@/lib/queries/pgErrors";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import {
  shapeInvoices,
  COMPANY_MARKET,
  type CostRowRaw,
  type CostView,
  type TrendPoint,
  type InvoiceDoc,
  type InvoiceDocRaw,
} from "./marketingCost.core";
import {
  shapeLeadCostView,
  shapeLeadTrend,
  shapeSpend,
  shapeSpendTrend,
  markEvenSplit,
  isoWeekStart,
  type OtherCosts,
  type AllocationRaw,
  type SpendView,
  type SpendTrendPoint,
} from "./marketingSpend.core";
import { SCORECARD_MARKETS } from "@/lib/scorecard/markets";

export * from "./marketingCost.core";

/**
 * Marketing cost reads — LP's `v_market_subsource_cost` (LP-MCP sql/158) and
 * the invoice ledger. Service-role client: the ledger tables carry no RLS
 * policy for the dashboard role, and nothing here is per-user.
 *
 * `needsMigration` is set when the view does not exist yet (sql/158 not
 * applied), so the tab says so instead of showing an empty table as "$0".
 */

export type MarketingCostResult = { view: CostView | null; other: OtherCosts | null; needsMigration: boolean; error: string | null };

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

/**
 * `YYYY-MM|market` of every even-split allocation with no sub-source in
 * [from, to] — the `(none)` rows that are Company-wide money, not leads with
 * no sub-source (marketingSpend.core markEvenSplit). Read fails → empty: the
 * money then reads as lead-source cost, which is what it did before.
 */
async function readEvenSplitKeys(from: string, to: string): Promise<Set<string>> {
  const { data, error } = await lpService().from("marketing_expense_allocations")
    .select("month, market").is("lp_sub_source", null).eq("rule", "equal")
    .gte("month", `${from.slice(0, 7)}-01`).lte("month", to).limit(1000);
  if (error) return new Set();
  return new Set(((data ?? []) as { month: string; market: string }[]).map((r) => `${r.month.slice(0, 7)}|${r.market}`));
}

/**
 * Lead Cost — lead sources only since 2026-10-19 (Software, Call Center,
 * Company-wide and held money moved to /marketing-spend (commissions stay:
 * lead-source cost since 2026-10-19); `other` is what was
 * left out, for the one line above the table).
 */
export async function getMarketingCost({
  market = COMPANY_MARKET, grain = "month", periodStart, periodEnd,
}: { market?: string; grain?: "month" | "week"; periodStart: string; periodEnd: string }): Promise<MarketingCostResult> {
  const from = grain === "week" ? isoWeekStart(periodStart) : `${periodStart.slice(0, 7)}-01`;
  const [r, keys] = await Promise.all([
    readView({ grain: grain === "week" ? "iso_week" : "month", from, to: periodEnd }),
    readEvenSplitKeys(from, periodEnd),
  ]);
  if (r.needsMigration || r.error) return { view: null, other: null, needsMigration: r.needsMigration, error: r.error };
  const shaped = shapeLeadCostView(markEvenSplit(r.rows, keys), { market, grain, periodStart: from, periodEnd });
  return { view: shaped.view, other: shaped.other, needsMigration: false, error: null };
}

function trendStart(through: string): string {
  const end = `${through.slice(0, 7)}-01`;
  return new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10);
}

/** Lead Cost's 12-month trend: lead-source cost only. */
export async function getMarketingCostTrend(market = COMPANY_MARKET, through: string): Promise<TrendPoint[]> {
  const start = trendStart(through);
  const end = `${through.slice(0, 7)}-01`;
  const [r, keys] = await Promise.all([readView({ grain: "month", from: start, to: end }), readEvenSplitKeys(start, end)]);
  return r.rows.length ? shapeLeadTrend(markEvenSplit(r.rows, keys), market) : [];
}

// ── /marketing-spend ─────────────────────────────────────────────────────

async function vendorNames(): Promise<Record<string, string>> {
  const { data } = await lpService().from("marketing_vendors").select("id, vendor_name");
  const names: Record<string, string> = {};
  for (const v of (data ?? []) as { id: string; vendor_name: string }[]) names[v.id] = v.vendor_name;
  return names;
}

export type MarketingSpendResult = { view: SpendView | null; needsMigration: boolean; error: string | null };

/**
 * Every approved marketing cost in the window, by category → vendor →
 * sub-source, read from the allocations themselves (the view has no vendor).
 * Same month / ISO-week window as v_market_subsource_cost.
 */
export async function getMarketingSpend({
  market = COMPANY_MARKET, grain = "month", periodStart, periodEnd,
}: { market?: string; grain?: "month" | "week"; periodStart: string; periodEnd: string }): Promise<MarketingSpendResult> {
  const sb = lpService();
  // A week window can reach back into the month before periodStart.
  const from = grain === "week" ? isoWeekStart(periodStart) : periodStart;
  try {
    const [allocs, names] = await Promise.all([
      fetchAllPages<AllocationRaw>("marketing_expense_allocations", (f, t) =>
        sb.from("marketing_expense_allocations")
          .select("id, month, market, lp_sub_source, amount, rule, marketing_expenses!inner(vendor_id, cost_type, status, period_start, period_end, provisional, flags)")
          .eq("marketing_expenses.status", "approved")
          .gte("month", `${from.slice(0, 7)}-01`).lte("month", periodEnd)
          .order("id").range(f, t) as unknown as PromiseLike<{ data: AllocationRaw[] | null; error: { message: string } | null }>,
      ),
      vendorNames(),
    ]);
    const view = shapeSpend(allocs, names, {
      market, grain, periodStart, periodEnd, markets: SCORECARD_MARKETS.map((m) => m.code),
    });
    return { view, needsMigration: false, error: null };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (isMissingRelation(e)) return { view: null, needsMigration: true, error: null };
    return { view: null, needsMigration: false, error: e?.message ?? String(err) };
  }
}

/** 12-month spend by category (the view at month grain). */
export async function getMarketingSpendTrend(market = COMPANY_MARKET, through: string): Promise<SpendTrendPoint[]> {
  const start = trendStart(through);
  const end = `${through.slice(0, 7)}-01`;
  const [r, keys] = await Promise.all([readView({ grain: "month", from: start, to: end }), readEvenSplitKeys(start, end)]);
  return r.rows.length ? shapeSpendTrend(markEvenSplit(r.rows, keys), market) : [];
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
  const docs = (data ?? []) as InvoiceDocRaw[];
  // The vendor a person picked on Edit lives on the document's expense rows.
  const [names, expenses] = await Promise.all([
    vendorNames(),
    docs.length
      ? sb.from("marketing_expenses").select("document_id, vendor_id, status").in("document_id", docs.map((d) => d.id)).not("vendor_id", "is", null)
      : Promise.resolve({ data: [] as { document_id: string; vendor_id: string; status: string }[] }),
  ]);
  const byDoc: Record<string, string> = {};
  for (const e of (expenses.data ?? []) as { document_id: string; vendor_id: string; status: string }[]) {
    if (!byDoc[e.document_id] || e.status === "approved") byDoc[e.document_id] = e.vendor_id;
  }
  return { docs: shapeInvoices(docs, names, byDoc), needsMigration: false };
}

/** The held expense rows (REECE_HOLD) of a month, for the "Apply recommendation" button. */
export async function getHeldExpenses(periodStart: string, periodEnd: string): Promise<{ id: string; description: string; amount: number; recommended_market: string | null; recommendation_reason: string | null }[]> {
  const sb = lpService();
  const { data, error } = await sb.from("marketing_expense_allocations")
    .select("expense_id, amount, recommended_market, recommendation_reason, month, marketing_expenses!inner(id, description, status)")
    // $0 rows are gaps a later feed pull closed: nothing to apply (2026-10-19).
    .eq("market", "REECE_HOLD").eq("rule", "hold").gt("amount", 0).gte("month", `${periodStart.slice(0, 7)}-01`).lte("month", periodEnd)
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
