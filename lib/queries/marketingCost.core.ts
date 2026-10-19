/**
 * Marketing cost view-model (pure) — the Scorecard › Sources "Lead Cost" tab.
 *
 * Reads rows of LP's `v_market_subsource_cost` (LP-MCP sql/158, 2026-10-12):
 * month and ISO-week grain × market × LP sub-source, with the funnel counts
 * (raw / set / issued / sat / sold, by lead-created date), Net / Working /
 * Gross $ from report 133, and the ledger's invoice + calculated cost.
 *
 * What these shape, in order of cost if wrong:
 *   - cost per ISSUED lead (never per raw lead — the old tab divided by raw),
 *   - a market shows only its own money (the old tab added company-wide Lead
 *     Gurus spend to every market),
 *   - REECE_HOLD money is shown as held with its recommendation and is never
 *     inside a market total,
 *   - † marks a provisional (feed, not yet invoiced) cost.
 * Postgres numerics arrive as strings over PostgREST; everything is coerced here.
 */

export type CostRowRaw = {
  grain: string;
  period_start: string;
  market: string;
  lp_sub_source: string | null;
  raw: number | string | null;
  set_count: number | string | null;
  issued: number | string | null;
  sat: number | string | null;
  sold: number | string | null;
  gross: number | string | null;
  working: number | string | null;
  net: number | string | null;
  lost?: number | string | null;
  invoice_cost: number | string | null;
  calculated_cost: number | string | null;
  total_cost?: number | string | null;
  has_provisional: boolean | null;
  as_of_snapshot: string | null;
  recommended_market?: string | null;
  recommendation_reason?: string | null;
};

export type CostRow = {
  campaign: string;
  raw: number;
  set: number;
  issued: number;
  demos: number;
  sold: number;
  issue_pct: number | null;
  demo_pct: number | null;
  std_pct: number | null;
  gross: number | null;
  working: number | null;
  net: number | null;
  nsli: number | null;
  invoice_cost: number;
  calculated_cost: number;
  total_cost: number;
  cost_per_issued: number | null;
  mkt_pct: number | null;
  provisional: boolean;
};

export type HeldRow = {
  total_cost: number;
  recommended_market: string | null;
  recommendation_reason: string | null;
};

export type CostView = {
  market: string;
  grain: "month" | "week";
  period_start: string;
  period_end: string;
  rows: CostRow[];
  totals: CostRow;
  held: HeldRow | null;
  as_of_snapshot: string | null;
  any_cost: boolean;
};

export type TrendPoint = { month: string; label: string; total_cost: number; cost_per_issued: number | null; issued: number };

export const COMPANY_MARKET = "REECE";
/** A campaign / source with no name reads "Unknown", never "(none)" (the user, 2026-10-19). */
export const UNKNOWN_SOURCE = "Unknown";
export function sourceLabel(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return !s || s.toLowerCase() === "(none)" ? UNKNOWN_SOURCE : s;
}
export const HOLD_MARKET = "REECE_HOLD";
const MARKET_RX = /_MKT$/;

export function n(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nn(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
/** Ratio as a percentage (×100, 1 decimal) or null on a zero denominator ("n.a." on screen). */
export function ratioPct(num: number, den: number): number | null {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}
function per(num: number | null, den: number): number | null {
  if (num == null || !den) return null;
  return Math.round((num / den) * 100) / 100;
}

type Agg = { campaign: string; raw: number; set: number; issued: number; demos: number; sold: number; gross: number; working: number; net: number; hasDollars: boolean; invoice_cost: number; calculated_cost: number; provisional: boolean };

function emptyAgg(campaign: string): Agg {
  return { campaign, raw: 0, set: 0, issued: 0, demos: 0, sold: 0, gross: 0, working: 0, net: 0, hasDollars: false, invoice_cost: 0, calculated_cost: 0, provisional: false };
}
function add(a: Agg, r: CostRowRaw) {
  a.raw += n(r.raw); a.set += n(r.set_count); a.issued += n(r.issued); a.demos += n(r.sat); a.sold += n(r.sold);
  if (r.gross != null || r.net != null || r.working != null) a.hasDollars = true;
  a.gross += n(r.gross); a.working += n(r.working); a.net += n(r.net);
  a.invoice_cost += n(r.invoice_cost); a.calculated_cost += n(r.calculated_cost);
  a.provisional = a.provisional || r.has_provisional === true;
}
function finish(a: Agg): CostRow {
  const total = Math.round((a.invoice_cost + a.calculated_cost) * 100) / 100;
  return {
    campaign: a.campaign, raw: a.raw, set: a.set, issued: a.issued, demos: a.demos, sold: a.sold,
    issue_pct: ratioPct(a.issued, a.set), demo_pct: ratioPct(a.demos, a.issued), std_pct: ratioPct(a.sold, a.demos),
    gross: a.hasDollars ? a.gross : null, working: a.hasDollars ? a.working : null, net: a.hasDollars ? a.net : null,
    nsli: a.hasDollars ? per(a.net, a.issued) : null,
    invoice_cost: Math.round(a.invoice_cost * 100) / 100, calculated_cost: Math.round(a.calculated_cost * 100) / 100, total_cost: total,
    cost_per_issued: per(total, a.issued),
    mkt_pct: a.hasDollars && a.net > 0 ? Math.round((total / a.net) * 1000) / 10 : null,
    provisional: a.provisional,
  };
}

/** Does this row belong to the selected market (REECE = every real market summed)? */
export function inMarket(row: { market: string }, market: string): boolean {
  if (market === COMPANY_MARKET || !market) return MARKET_RX.test(row.market);
  return row.market === market;
}

/**
 * Shape the view rows for one market and window into Brad's columns.
 * Rows outside [periodStart, periodEnd] (by period_start) are ignored, so an
 * aggregate period (3 months, YTD) is a sum of its months.
 */
export function shapeCostView(
  rows: CostRowRaw[],
  { market, grain, periodStart, periodEnd }: { market: string; grain: "month" | "week"; periodStart: string; periodEnd: string },
): CostView {
  const g = grain === "week" ? "iso_week" : "month";
  const inWindow = rows.filter((r) => r.grain === g && r.period_start >= periodStart && r.period_start <= periodEnd);
  const by = new Map<string, Agg>();
  const totals = emptyAgg("All campaigns");
  let asOf: string | null = null;
  let held: HeldRow | null = null;
  const heldReasons = new Set<string>();
  const heldMarkets = new Set<string>();
  for (const r of inWindow) {
    if (r.market === HOLD_MARKET) {
      const cost = n(r.invoice_cost) + n(r.calculated_cost);
      if (!cost) continue;
      held ??= { total_cost: 0, recommended_market: null, recommendation_reason: null };
      held.total_cost = Math.round((held.total_cost + cost) * 100) / 100;
      if (r.recommended_market) heldMarkets.add(r.recommended_market);
      if (r.recommendation_reason) heldReasons.add(r.recommendation_reason);
      continue;
    }
    if (!inMarket(r, market)) continue;
    const key = sourceLabel(r.lp_sub_source);
    const a = by.get(key) ?? emptyAgg(key);
    add(a, r);
    by.set(key, a);
    add(totals, r);
    if (r.as_of_snapshot && (!asOf || r.as_of_snapshot > asOf)) asOf = r.as_of_snapshot;
  }
  if (held) {
    held.recommended_market = heldMarkets.size ? [...heldMarkets].join(",") : null;
    held.recommendation_reason = heldReasons.size ? [...heldReasons].join(" | ") : null;
  }
  const shaped = [...by.values()].map(finish)
    .filter((r) => r.raw || r.issued || r.total_cost || r.gross)
    .sort((a, b) => b.total_cost - a.total_cost || b.raw - a.raw);
  return {
    market: market || COMPANY_MARKET, grain, period_start: periodStart, period_end: periodEnd,
    rows: shaped, totals: finish(totals), held, as_of_snapshot: asOf,
    any_cost: shaped.some((r) => r.total_cost > 0) || !!held,
  };
}

/** 12-month trend of total cost and cost per issued lead for one market. */
export function shapeTrend(rows: CostRowRaw[], market: string, months = 12): TrendPoint[] {
  const by = new Map<string, { total: number; issued: number }>();
  for (const r of rows) {
    if (r.grain !== "month" || !inMarket(r, market)) continue;
    const k = r.period_start.slice(0, 7);
    const a = by.get(k) ?? { total: 0, issued: 0 };
    a.total += n(r.invoice_cost) + n(r.calculated_cost);
    a.issued += n(r.issued);
    by.set(k, a);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([month, a]) => ({
    month, label: monthShort(month), total_cost: Math.round(a.total * 100) / 100, cost_per_issued: per(a.total, a.issued), issued: a.issued,
  }));
}

export function monthShort(ym: string): string {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(ym.slice(5, 7)) - 1] ?? ym;
  return `${m} ${ym.slice(2, 4)}`;
}

/** "n.a." on a null ratio, else the formatted value. */
export function na<T>(v: T | null | undefined, fmt: (v: T) => string): string {
  return v === null || v === undefined ? "n.a." : fmt(v);
}

export type InvoiceDocRaw = {
  id: string;
  status: string;
  from_address: string | null;
  subject: string | null;
  received_at: string | null;
  file_name: string | null;
  analyzer: string | null;
  analysis: { facts?: { total?: number | string | null; invoice_number?: string | null; period_start?: string | null; period_end?: string | null; vendor_name_hint?: string | null }; vendor_id?: string | null; flags?: string[] } | null;
  extracted_text: string | null;
  storage_path: string | null;
  created_at: string;
};

export type InvoiceDoc = {
  id: string;
  status: string;
  /** In review / Posted / Rejected / Failed — what a person reads. */
  status_label: string;
  from: string;
  subject: string;
  received_at: string | null;
  file_name: string;
  vendor: string;
  invoice_number: string;
  period: string;
  total: number | null;
  flags: string[];
  analyzer: string;
  extracted_text: string;
  has_file: boolean;
};

/** Plain status label (2026-10-19): posted, rejected and failed say so; every other step is still in review. */
export function invoiceStatusLabel(status: string): string {
  if (status === "posted") return "Posted";
  if (status === "rejected") return "Rejected";
  if (status === "failed") return "Failed";
  return "In review";
}

/**
 * Vendor name, in order (2026-10-19): the analysis's vendor → the vendor on
 * the document's expense rows (LP-MCP writes that on Edit; the analysis kept
 * the model's guess, so Unbounce read "unknown") → the name printed on the
 * invoice → "Unknown".
 */
export function shapeInvoices(
  docs: InvoiceDocRaw[],
  vendorNames: Record<string, string> = {},
  expenseVendorByDoc: Record<string, string> = {},
): InvoiceDoc[] {
  return docs.map((d) => {
    const f = d.analysis?.facts ?? {};
    const byId = (id: string | null | undefined) => (id ? vendorNames[id] : undefined);
    const vendor = byId(d.analysis?.vendor_id) || byId(expenseVendorByDoc[d.id]) || f.vendor_name_hint?.trim() || "Unknown";
    return {
      id: d.id, status: d.status, status_label: invoiceStatusLabel(d.status), from: d.from_address ?? "—", subject: d.subject ?? "", received_at: d.received_at,
      file_name: d.file_name ?? "(email body)", vendor,
      invoice_number: f.invoice_number ?? "—",
      period: f.period_start && f.period_end ? `${f.period_start} → ${f.period_end}` : "—",
      total: nn(f.total), flags: d.analysis?.flags ?? [], analyzer: d.analyzer ?? "—",
      extracted_text: (d.extracted_text ?? "").slice(0, 4000), has_file: !!d.storage_path,
    };
  });
}

/** Rejected invoices are hidden unless asked for (a rejected duplicate is not news). */
export function visibleInvoices(docs: InvoiceDoc[], showRejected: boolean): InvoiceDoc[] {
  return showRejected ? docs : docs.filter((d) => d.status !== "rejected");
}
