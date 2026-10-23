/**
 * Marketing cost view-model (pure) — the Scorecard › Sources "Lead Cost" tab.
 *
 * Reads rows of LP's `v_market_subsource_cost` (LP-MCP sql/158, 2026-10-12):
 * month and ISO-week grain × market × LP sub-source, with the funnel counts
 * (raw / set / issued / sat / sold, by lead-created date), Net / Working /
 * Gross $ (since 2026-10-23, LP-MCP 20261023120000: sales on leads CREATED in
 * the period, as LP 136 counts them; Net / Working from each job's latest
 * report 133 status), and the ledger's invoice + calculated cost.
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
  /** Issued leads a LightFire agent set (LP-MCP migration 20261023120000). Absent before it. */
  cc_issued?: number | string | null;
  /** Call Center cost spread onto this row by allocateCallCenter (dashboard only, never the ledger). */
  cc_allocated?: number | null;
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
  /** Issued leads set by LightFire: the basis of the call-center spread. */
  cc_issued: number;
  /** Call Center cost inside total_cost when the spread is on (0 otherwise). */
  cc_allocated: number;
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
/**
 * Billed but not found (LP-MCP allocation.js DISPUTED_MARKET, 2026-10-19): the
 * part of a call-center invoice line we could not match to its leads, parked
 * until a revised invoice, a confirmed charge or a credit settles it. Not an
 * office's cost, so never in a market's numbers.
 */
export const DISPUTED_MARKET = "DISPUTED";
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

type Agg = { campaign: string; raw: number; set: number; issued: number; demos: number; sold: number; gross: number; working: number; net: number; hasDollars: boolean; invoice_cost: number; calculated_cost: number; provisional: boolean; cc_issued: number; cc_allocated: number };

function emptyAgg(campaign: string): Agg {
  return { campaign, raw: 0, set: 0, issued: 0, demos: 0, sold: 0, gross: 0, working: 0, net: 0, hasDollars: false, invoice_cost: 0, calculated_cost: 0, provisional: false, cc_issued: 0, cc_allocated: 0 };
}
function add(a: Agg, r: CostRowRaw) {
  a.raw += n(r.raw); a.set += n(r.set_count); a.issued += n(r.issued); a.demos += n(r.sat); a.sold += n(r.sold);
  if (r.gross != null || r.net != null || r.working != null) a.hasDollars = true;
  a.gross += n(r.gross); a.working += n(r.working); a.net += n(r.net);
  a.invoice_cost += n(r.invoice_cost); a.calculated_cost += n(r.calculated_cost);
  a.provisional = a.provisional || r.has_provisional === true;
  a.cc_issued += n(r.cc_issued); a.cc_allocated += n(r.cc_allocated);
}
function finish(a: Agg): CostRow {
  const ccAllocated = Math.round(a.cc_allocated * 100) / 100;
  const total = Math.round((a.invoice_cost + a.calculated_cost + a.cc_allocated) * 100) / 100;
  return {
    campaign: a.campaign, raw: a.raw, set: a.set, issued: a.issued, demos: a.demos, sold: a.sold,
    issue_pct: ratioPct(a.issued, a.set), demo_pct: ratioPct(a.demos, a.issued), std_pct: ratioPct(a.sold, a.demos),
    gross: a.hasDollars ? a.gross : null, working: a.hasDollars ? a.working : null, net: a.hasDollars ? a.net : null,
    nsli: a.hasDollars ? per(a.net, a.issued) : null,
    invoice_cost: Math.round(a.invoice_cost * 100) / 100, calculated_cost: Math.round(a.calculated_cost * 100) / 100, total_cost: total,
    cost_per_issued: per(total, a.issued),
    mkt_pct: a.hasDollars && a.net > 0 ? Math.round((total / a.net) * 1000) / 10 : null,
    provisional: a.provisional,
    cc_issued: a.cc_issued, cc_allocated: ccAllocated,
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
  const totals = emptyAgg("All lead sources");
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

/**
 * What a viewer may see of an invoice (the user, 2026-10-19): invoices can carry
 * bank details, so the original file and the extracted text are for admins
 * only. Anyone else gets the facts (vendor, total, period, status) and nothing
 * the file said: the text never reaches their browser, and the file link is not drawn.
 */
export function invoicesForViewer(docs: InvoiceDoc[], isAdmin: boolean): InvoiceDoc[] {
  return isAdmin ? docs : docs.map((d) => ({ ...d, extracted_text: "", has_file: false }));
}

/** Rejected invoices are hidden unless asked for (a rejected duplicate is not news). */
export function visibleInvoices(docs: InvoiceDoc[], showRejected: boolean): InvoiceDoc[] {
  return showRejected ? docs : docs.filter((d) => d.status !== "rejected");
}

/**
 * The invoice view's detail (2026-10-19, the user: "a button that displays the
 * invoice and lets me update the credit received, confirm the charge, or reopen
 * a disputed amount"). Pure: the rows come from marketing_expenses,
 * marketing_expense_allocations and the document's analysis. LP-MCP keeps
 * `analysis.credits` as the credits in force (`was` = what was billed) and
 * `analysis.dispute_log` as every confirm / credit / reopen.
 */
export type InvoiceLineRaw = {
  id: string;
  line_no: number | null;
  description: string | null;
  amount: number | string | null;
  status: string;
  flags: string[] | null;
  period_start: string | null;
  period_end: string | null;
};
export type InvoiceAllocationRaw = { expense_id: string; month: string; market: string; amount: number | string | null };
export type DisputeCredit = { expense_id: string; line_no?: number | null; was: number; credited: number; by?: string; at?: string };
export type DisputeLogEntry = { action: "accept" | "credit" | "reopen"; amount: number; by?: string; at?: string };

export type InvoiceLine = {
  id: string;
  line_no: number;
  description: string;
  status: string;
  /** What the vendor billed (before any credit). */
  billed: number;
  /** What is charged now (billed − credit). */
  amount: number;
  credited: number;
  disputed: number;
  confirmed: boolean;
  period: string;
  offices: { market: string; amount: number }[];
};

export type DisputeState = "none" | "open" | "confirmed" | "credited";

export type InvoiceDetail = {
  lines: InvoiceLine[];
  billed: number;
  charged: number;
  disputed: number;
  credited: number;
  state: DisputeState;
  /** The most a credit can be: what is disputed now plus what a confirm or credit settled (null: a confirm made before the log existed; LP-MCP checks). */
  creditMax: number | null;
  canConfirm: boolean;
  canCredit: boolean;
  canReopen: boolean;
  log: DisputeLogEntry[];
};

const c2 = (n: number) => Math.round(n * 100) / 100;

export function shapeInvoiceDetail(
  rows: InvoiceLineRaw[],
  allocations: InvoiceAllocationRaw[],
  analysis: { credits?: DisputeCredit[] | null; dispute_log?: DisputeLogEntry[] | null } | null,
): InvoiceDetail {
  const credits = Array.isArray(analysis?.credits) ? analysis!.credits! : [];
  const log = Array.isArray(analysis?.dispute_log) ? analysis!.dispute_log! : [];
  const lines: InvoiceLine[] = rows
    .filter((r) => r.status !== "superseded")
    .sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0))
    .map((r) => {
      const amount = nn(r.amount) ?? 0;
      const mine = credits.filter((c) => c.expense_id === r.id);
      const credited = c2(mine.reduce((t, c) => t + (Number(c.credited) || 0), 0));
      const billed = mine.length ? Number(mine[0]!.was) || amount : amount;
      const byMarket = new Map<string, number>();
      let disputed = 0;
      for (const a of allocations) {
        if (a.expense_id !== r.id) continue;
        const v = nn(a.amount) ?? 0;
        if (a.market === DISPUTED_MARKET) disputed += v;
        else byMarket.set(a.market, (byMarket.get(a.market) ?? 0) + v);
      }
      return {
        id: r.id, line_no: r.line_no ?? 0, description: (r.description ?? "").trim() || "Invoice line", status: r.status,
        billed: c2(billed), amount: c2(amount), credited, disputed: c2(disputed),
        confirmed: (r.flags ?? []).includes("dispute_accepted"),
        period: r.period_start && r.period_end ? (r.period_start === r.period_end ? r.period_start : `${r.period_start} → ${r.period_end}`) : "—",
        offices: [...byMarket.entries()].map(([market, v]) => ({ market, amount: c2(v) })).filter((o) => o.amount !== 0).sort((a, b) => b.amount - a.amount),
      };
    });
  const sum = (k: "billed" | "amount" | "credited" | "disputed") => c2(lines.reduce((t, l) => t + l[k], 0));
  const disputed = sum("disputed");
  const credited = sum("credited");
  const confirmed = lines.some((l) => l.confirmed);
  const approved = lines.some((l) => l.status === "approved");
  const state: DisputeState = disputed > 0 ? "open" : credited > 0 ? "credited" : confirmed ? "confirmed" : "none";
  // A confirm keeps no amount on the lines; its log entry says what it settled.
  const lastAccept = [...log].reverse().find((e) => e.action === "accept");
  const confirmedAmount = confirmed ? Number(lastAccept?.amount) || 0 : 0;
  const creditMax = confirmed && !lastAccept ? null : c2(disputed + credited + confirmedAmount);
  return {
    lines, billed: sum("billed"), charged: sum("amount"), disputed, credited, state, creditMax,
    canConfirm: approved && disputed > 0,
    canCredit: approved && (creditMax == null || creditMax > 0),
    canReopen: approved && (credited > 0 || confirmed),
    log,
  };
}

/**
 * The invoice view's edit form, filled from the invoice's lines (2026-10-19, the
 * user: "View and Edit … doesn't allow any edits"). The split mirrors the Slack
 * Edit form: by the sub-source's issued leads ([] markets), evenly as software or
 * call center ([ALL_OFFICES] + that label), evenly (other ALL_OFFICES), or only
 * the markets picked. Amount is editable only on a one-line invoice, as in Slack.
 */
export type InvoiceSplit = "by_source" | "software" | "call_center" | "even" | "markets";
export type InvoiceEditForm = {
  vendor_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  amount: string;
  one_line: boolean;
  lp_sub_sources: string;
  split: InvoiceSplit;
  eligible_markets: string[];
};
export type InvoiceEditRow = InvoiceLineRaw & { vendor_id?: string | null; invoice_number?: string | null; lp_sub_sources?: string[] | null; eligible_markets?: string[] | null };

export function invoiceEditDefaults(rows: InvoiceEditRow[]): InvoiceEditForm {
  const live = rows.filter((r) => r.status !== "superseded");
  const first = live.find((r) => r.status === "pending_review") ?? live[0];
  const subs = (first?.lp_sub_sources ?? []).filter(Boolean);
  const markets = (first?.eligible_markets ?? []).filter(Boolean);
  const label = subs[0]?.trim().toLowerCase();
  const split: InvoiceSplit = markets.includes("ALL_OFFICES")
    ? label === "software" ? "software" : label === "call center" ? "call_center" : "even"
    : markets.length ? "markets" : "by_source";
  return {
    vendor_id: live.find((r) => r.vendor_id)?.vendor_id ?? "",
    invoice_number: first?.invoice_number ?? "",
    period_start: first?.period_start ?? "",
    period_end: first?.period_end ?? "",
    amount: live.length === 1 && first?.amount != null ? String(nn(first.amount) ?? "") : "",
    one_line: live.length === 1,
    lp_sub_sources: split === "software" || split === "call_center" ? "" : subs.join(", "),
    split,
    eligible_markets: split === "markets" ? markets : [],
  };
}
