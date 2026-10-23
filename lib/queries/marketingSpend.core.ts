/**
 * Marketing Spend view-model (pure) — the /marketing-spend page and the
 * lead-only filter on Scorecard › Sources & lead cost (2026-10-19).
 *
 * LP-MCP's ledger puts EVERY marketing cost in `v_market_subsource_cost`,
 * keyed by `lp_sub_source`, not only lead sources:
 *   - `Software` / `Call Center` — split evenly across the six offices
 *     (Hatch, Unbounce), carried as the line's sub-source label;
 *   - `Company-wide` — an even split with no category;
 *   - `REECE_HOLD` — held at company level, never split;
 *   - `DISPUTED` — billed but not found (a call-center invoice billed 12 demos,
 *     we found 9): accepted as received, parked until settled (2026-10-19).
 *
 * Unbounce invoice 400 ($149, Software, $97.78 in Oct 2026) sat inside the
 * Lead Cost table as a "campaign" with no leads. Lead Cost now shows lead
 * sources only (`shapeLeadCostView`); everything else is one "Other marketing
 * costs" line and the whole picture lives on /marketing-spend (`shapeSpend`).
 *
 * Commissions (the `calculated_cost` part: Canvass, MVP Marketing,
 * LeadPilotData, Previous Customer / Referral) ARE lead-source cost (the user,
 * 2026-10-19, reversing the same morning's split): they count in Lead Cost and
 * in "Lead sources" on Marketing Spend. Canvass at 15% is an estimate until
 * canvasser payroll is uploaded; LP-MCP marks those rows provisional with
 * flags {estimate}, shown as † / "Estimate".
 */

import {
  shapeCostView,
  shapeTrend,
  inMarket,
  monthShort,
  n,
  sourceLabel,
  HOLD_MARKET,
  DISPUTED_MARKET,
  type CostRowRaw,
  type CostView,
  type TrendPoint,
} from "./marketingCost.core";

export type CostCategory = "lead_source" | "software" | "call_center" | "company_wide" | "held" | "disputed";

/** Fixed order: tiles, table groups, chart stack and legend all follow it. */
export const CATEGORY_ORDER: readonly CostCategory[] = ["lead_source", "software", "call_center", "company_wide", "held", "disputed"];

export const CATEGORY_LABEL: Record<CostCategory, string> = {
  lead_source: "Lead sources",
  software: "Software",
  call_center: "Call center",
  company_wide: "Company-wide",
  held: "Held at company level",
  disputed: "Disputed (not charged to an office)",
};

/** The categories Lead Cost no longer shows; they sum into its "Other marketing costs" line. */
export const OTHER_CATEGORIES: readonly CostCategory[] = ["software", "call_center", "company_wide", "held", "disputed"];

/** Company-level money that is no office's cost: held, and disputed. */
export const PARKED_MARKETS: readonly string[] = [HOLD_MARKET, DISPUTED_MARKET];
const parked = (m: string) => PARKED_MARKETS.includes(m);

export type CategoryInput = {
  market: string;
  lp_sub_source: string | null;
  /** The allocation was an even split (rule `equal`). Only `(none)` needs it. */
  even_split?: boolean | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Which kind of marketing cost a row (or one part of it) is. `part` is the
 * column the money came from: the calculated part (a commission) belongs to
 * its lead source, unless it is held — held money stays held whatever it is.
 */
export function costCategory(row: CategoryInput, part: "invoice" | "calculated" = "invoice"): CostCategory {
  if (row.market === HOLD_MARKET) return "held";
  if (row.market === DISPUTED_MARKET) return "disputed";
  if (part === "calculated") return "lead_source";
  const ss = norm(row.lp_sub_source);
  if (ss === "software") return "software";
  if (ss === "call center") return "call_center";
  if (ss === "company-wide") return "company_wide";
  if ((ss === "" || ss === "(none)") && row.even_split) return "company_wide";
  return "lead_source";
}

export type CostPart = { category: CostCategory; amount: number };

/** A view row's money, split into its invoice part and its calculated part. */
export function costParts(row: CostRowRaw & { even_split?: boolean | null }): CostPart[] {
  const out: CostPart[] = [];
  const inv = n(row.invoice_cost);
  const calc = n(row.calculated_cost);
  if (inv) out.push({ category: costCategory(row, "invoice"), amount: inv });
  if (calc) out.push({ category: costCategory(row, "calculated"), amount: calc });
  return out;
}

/**
 * Mark the `(none)` rows whose money is an even split (Company-wide with no
 * label). `keys` holds `YYYY-MM|market` of every `equal` allocation with no
 * sub-source; a week row counts when either month it touches has one.
 */
export function markEvenSplit<T extends CostRowRaw>(rows: T[], keys: Set<string>): (T & { even_split: boolean })[] {
  return rows.map((r) => {
    const none = !r.lp_sub_source || r.lp_sub_source === "(none)";
    if (!none || !keys.size) return { ...r, even_split: false };
    const months = [r.period_start.slice(0, 7)];
    if (r.grain === "iso_week") months.push(addDays(r.period_start, 6).slice(0, 7));
    return { ...r, even_split: months.some((m) => keys.has(`${m}|${r.market}`)) };
  });
}

/**
 * The rows Lead Cost reads: lead-source money only. Counts and Net $ stay on
 * every row (a lead is a lead); non-lead invoice cost is zeroed, so
 * shapeCostView drops a row that is left with nothing (Software, Call
 * Center). Commissions stay (lead-source cost since 2026-10-19). Held rows
 * pass through.
 */
export function leadOnlyRows<T extends CostRowRaw & { even_split?: boolean | null }>(rows: T[]): T[] {
  return rows.map((r) => {
    if (parked(r.market)) return r;
    const lead = costCategory(r, "invoice") === "lead_source";
    const invoice = lead ? n(r.invoice_cost) : 0;
    const calculated = n(r.calculated_cost);
    return { ...r, invoice_cost: invoice, calculated_cost: calculated, total_cost: invoice + calculated };
  });
}

type Window = { market: string; grain: "month" | "week"; periodStart: string; periodEnd: string };

/** The same row selection shapeCostView makes: grain, window, market. Held is excluded. */
function rowsInWindow<T extends CostRowRaw>(rows: T[], { market, grain, periodStart, periodEnd }: Window): T[] {
  const g = grain === "week" ? "iso_week" : "month";
  return rows.filter((r) => r.grain === g && r.period_start >= periodStart && r.period_start <= periodEnd && r.market !== HOLD_MARKET && inMarket(r, market));
}

export type OtherCosts = { total: number; by: Record<CostCategory, number> };

const r2 = (v: number) => Math.round(v * 100) / 100;
function zeroBy(): Record<CostCategory, number> {
  return { lead_source: 0, software: 0, call_center: 0, company_wide: 0, held: 0, disputed: 0 };
}

/**
 * Exactly the money Lead Cost leaves out, for the same market and window:
 * what leadOnlyRows dropped, plus (company view only) held money, which moved
 * to /marketing-spend with its recommendation (the user, 2026-10-19: the
 * scorecard is for sales).
 */
export function otherCosts(rows: (CostRowRaw & { even_split?: boolean | null })[], w: Window): OtherCosts {
  const by = zeroBy();
  for (const r of rowsInWindow(rows, w)) {
    for (const p of costParts(r)) if (p.category !== "lead_source") by[p.category] += p.amount;
  }
  if (!w.market || w.market === "REECE") {
    const g = w.grain === "week" ? "iso_week" : "month";
    for (const r of rows) {
      if (parked(r.market) && r.grain === g && r.period_start >= w.periodStart && r.period_start <= w.periodEnd) {
        by[r.market === HOLD_MARKET ? "held" : "disputed"] += n(r.invoice_cost) + n(r.calculated_cost);
      }
    }
  }
  let total = 0;
  for (const k of CATEGORY_ORDER) { by[k] = r2(by[k]); total += by[k]; }
  return { total: r2(total), by };
}

/**
 * Lead Cost's two lists (handoff 2026-10-23): sources with sales or cost
 * first, everything else in a collapsed "Other sources" section. The
 * "All lead sources" total still sums both.
 */
export function splitPrimaryRows<R extends { gross: number | null; total_cost: number }>(rows: R[]): { primary: R[]; other: R[] } {
  const primary: R[] = [];
  const other: R[] = [];
  for (const r of rows) ((r.gross ?? 0) > 0 || r.total_cost > 0 ? primary : other).push(r);
  return { primary, other };
}

export type LeadCostShape = { view: CostView; other: OtherCosts };

/** Lead Cost for one market and window: lead sources only, plus what was left out. */
export function shapeLeadCostView(rows: (CostRowRaw & { even_split?: boolean | null })[], w: Window): LeadCostShape {
  return { view: shapeCostView(leadOnlyRows(rows), w), other: otherCosts(rows, w) };
}

/** The Lead Cost 12-month trend: lead-source cost only. */
export function shapeLeadTrend(rows: (CostRowRaw & { even_split?: boolean | null })[], market: string, months = 12): TrendPoint[] {
  return shapeTrend(leadOnlyRows(rows), market, months);
}

// ── /marketing-spend ─────────────────────────────────────────────────────

export type AllocationRaw = {
  id: string;
  month: string;
  market: string;
  lp_sub_source: string | null;
  amount: number | string | null;
  rule: string | null;
  marketing_expenses: {
    vendor_id: string | null;
    cost_type: string | null;
    status: string | null;
    period_start: string | null;
    period_end: string | null;
    /** LP-MCP: true on a feed day or an estimated commission (Canvass until payroll). */
    provisional?: boolean | null;
    flags?: string[] | null;
  } | null;
};

/** An allocation whose expense is an estimate, not the real cost (Canvass commission until payroll). */
export function isEstimate(a: AllocationRaw): boolean {
  return (a.marketing_expenses?.flags ?? []).includes("estimate");
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Monday of the ISO week containing ymd. */
export function isoWeekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return addDays(ymd, -((d.getUTCDay() || 7) - 1));
}
function monthEnd(month: string): string {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The part of one allocation that falls in the page's window — the same
 * arithmetic as v_market_subsource_cost, so the two agree:
 *   month grain: allocations whose month starts in [first of periodStart's month, periodEnd];
 *   week grain:  the allocation spread by day over its slice (the expense's
 *                period inside the allocation's month), summed over the ISO
 *                weeks that start in [periodStart's Monday, periodEnd].
 */
export function allocationInWindow(a: AllocationRaw, grain: "month" | "week", periodStart: string, periodEnd: string): number {
  const amount = n(a.amount);
  if (!amount) return 0;
  const month = a.month.slice(0, 10);
  if (grain === "month") {
    return month >= `${periodStart.slice(0, 7)}-01` && month <= periodEnd ? amount : 0;
  }
  const e = a.marketing_expenses;
  // GREATEST / LEAST ignore NULLs in Postgres, so a missing period is the month.
  const start = e?.period_start && e.period_start > month ? e.period_start : month;
  const mEnd = monthEnd(month);
  const end = e?.period_end && e.period_end < mEnd ? e.period_end : mEnd;
  const lastDay = end > start ? end : start;
  const perDay = amount / Math.max(1, daysBetween(start, end) + 1);
  const from = isoWeekStart(periodStart);
  const to = addDays(isoWeekStart(periodEnd), 6);
  const lo = start > from ? start : from;
  const hi = lastDay < to ? lastDay : to;
  if (hi < lo) return 0;
  return perDay * (daysBetween(lo, hi) + 1);
}

export type SpendCells = { total: number; byMarket: Record<string, number> };
export type SpendSubSource = SpendCells & { sub_source: string; estimate: boolean };
export type SpendVendor = SpendCells & { vendor: string; estimate: boolean; subSources: SpendSubSource[] };
export type SpendGroup = SpendCells & { category: CostCategory; label: string; vendors: SpendVendor[] };

export type SpendView = {
  market: string;
  columns: string[];
  tiles: Record<CostCategory, number> & { total: number };
  groups: SpendGroup[];
};

function cells(columns: string[]): SpendCells {
  return { total: 0, byMarket: Object.fromEntries(columns.map((c) => [c, 0])) };
}
function bump(c: SpendCells, col: string, v: number) {
  c.total += v;
  c.byMarket[col] = (c.byMarket[col] ?? 0) + v;
}
function round(c: SpendCells) {
  c.total = r2(c.total);
  for (const k of Object.keys(c.byMarket)) c.byMarket[k] = r2(c.byMarket[k] ?? 0);
}

/**
 * Every approved allocation in the window, by category → vendor → sub-source,
 * with one column per market (+ Held for the company view) and a Total.
 *
 * `markets` is the column order for the company view; a code the view has
 * that is not in it (Houston, Winston-Salem once they cost money) is added
 * after it. A single-market view has that market's column only and no held
 * money: held is company level.
 */
export function shapeSpend(
  allocs: AllocationRaw[],
  vendorNames: Record<string, string>,
  { market, grain, periodStart, periodEnd, markets }: Window & { markets: readonly string[] },
): SpendView {
  const company = !market || market === "REECE";
  const seen = new Set<string>();
  const parts: { col: string; category: CostCategory; vendor: string; sub: string; amount: number; estimate: boolean }[] = [];
  for (const a of allocs) {
    const e = a.marketing_expenses;
    if (!e || e.status !== "approved") continue;
    const inScope = company ? (parked(a.market) || inMarket(a, "REECE")) : a.market === market;
    if (!inScope) continue;
    const amount = allocationInWindow(a, grain, periodStart, periodEnd);
    if (!amount) continue;
    const category = costCategory(
      { market: a.market, lp_sub_source: a.lp_sub_source, even_split: a.rule === "equal" },
      e.cost_type === "calculated" ? "calculated" : "invoice",
    );
    if (!parked(a.market)) seen.add(a.market);
    parts.push({
      col: a.market, category, amount, estimate: isEstimate(a),
      vendor: (e.vendor_id && vendorNames[e.vendor_id]) || "Unknown vendor",
      sub: sourceLabel(a.lp_sub_source),
    });
  }

  // Disputed gets a column only when there is some: it is the exception.
  const anyDisputed = parts.some((p) => p.col === DISPUTED_MARKET);
  const columns = company
    ? [...markets, ...[...seen].filter((m) => !markets.includes(m)).sort(), HOLD_MARKET, ...(anyDisputed ? [DISPUTED_MARKET] : [])]
    : [market];

  const groups = new Map<CostCategory, SpendGroup>();
  const vendors = new Map<string, SpendVendor>();
  const subs = new Map<string, SpendSubSource>();
  for (const p of parts) {
    const g = groups.get(p.category) ?? { ...cells(columns), category: p.category, label: CATEGORY_LABEL[p.category], vendors: [] };
    groups.set(p.category, g);
    const vk = `${p.category}|${p.vendor}`;
    let v = vendors.get(vk);
    if (!v) { v = { ...cells(columns), vendor: p.vendor, estimate: false, subSources: [] }; vendors.set(vk, v); g.vendors.push(v); }
    const sk = `${vk}|${p.sub}`;
    let s = subs.get(sk);
    if (!s) { s = { ...cells(columns), sub_source: p.sub, estimate: false }; subs.set(sk, s); v.subSources.push(s); }
    if (p.estimate) { v.estimate = true; s.estimate = true; }
    bump(g, p.col, p.amount); bump(v, p.col, p.amount); bump(s, p.col, p.amount);
  }

  const byTotal = <T extends SpendCells>(a: T, b: T) => b.total - a.total;
  const list = [...groups.values()];
  for (const g of list) {
    round(g);
    for (const v of g.vendors) { round(v); v.subSources.forEach(round); v.subSources.sort(byTotal); }
    g.vendors.sort(byTotal);
  }
  list.sort(byTotal);

  const tiles = { ...zeroBy(), total: 0 };
  for (const g of list) tiles[g.category] = g.total;
  tiles.total = r2(CATEGORY_ORDER.reduce((s, k) => s + tiles[k], 0));
  return { market: company ? "REECE" : market, columns, tiles, groups: list };
}

export type SpendTrendPoint = { month: string; label: string; total: number } & Record<CostCategory, number>;

/** 12-month spend by category for one market (REECE adds held money). */
export function shapeSpendTrend(rows: (CostRowRaw & { even_split?: boolean | null })[], market: string, months = 12): SpendTrendPoint[] {
  const company = !market || market === "REECE";
  const by = new Map<string, Record<CostCategory, number>>();
  for (const r of rows) {
    if (r.grain !== "month") continue;
    if (!(company ? parked(r.market) || inMarket(r, "REECE") : r.market === market)) continue;
    const k = r.period_start.slice(0, 7);
    const acc = by.get(k) ?? zeroBy();
    for (const p of costParts(r)) acc[p.category] += p.amount;
    by.set(k, acc);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([month, acc]) => {
    const point = { month, label: monthShort(month), total: 0, ...zeroBy() };
    for (const c of CATEGORY_ORDER) { point[c] = r2(acc[c]); point.total += point[c]; }
    point.total = r2(point.total);
    return point;
  });
}

// ── Held spend, in plain words ───────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (ymd: string) => `${MONTHS[Number(ymd.slice(5, 7)) - 1] ?? ymd.slice(5, 7)} ${Number(ymd.slice(8, 10))}`;

/**
 * "Lead Gurus feed 2026-10-17 · not attributed to any territory (daily total −
 * territories)" → "Lead Gurus spend on Oct 17 that Lead Gurus did not tag to an
 * office". Anything else is returned as written.
 */
export function plainHoldDescription(desc: string): string {
  const m = /^Lead Gurus feed (\d{4}-\d{2}-\d{2}) · (.+)$/.exec(desc.trim());
  if (!m) return desc;
  const [, date, what] = m as unknown as [string, string, string];
  if (/not attributed to any territory/i.test(what)) return `Lead Gurus spend on ${dayLabel(date)} that Lead Gurus did not tag to an office`;
  return `Lead Gurus spend on ${dayLabel(date)} in their "${what.replace(/ \(territory not mapped\)$/, "")}" territory`;
}

/**
 * The recommendation in plain words. LP-MCP writes "JAX_MKT 1/1 lead —
 * matched LP Prospect 465302, branch JAX"; a person needs "Jacksonville (1 of
 * 1 lead that day)". No market → why not.
 */
export function plainHoldReason(recommended: string | null, reason: string | null, label: (code: string) => string): string {
  if (!recommended) return "No office could be matched from that day's leads, so a person has to pick one.";
  const shares = [...(reason ?? "").matchAll(/([A-Z]+_MKT) (\d+)\/(\d+) leads?/g)];
  if (!shares.length) return `Suggested: ${recommended.split(",").map(label).join(", ")}.`;
  const total = shares[0]![3];
  const parts = shares.map((s) => `${label(s[1]!)} (${s[2]} of ${total})`);
  return `Suggested: ${parts.join(", ")}, by the Lead Gurus leads from that day we matched in LP.`;
}

/**
 * "All marketing" (the user, 2026-10-19: a line item that adds software and
 * call-center cost to the overall marketing cost, with both targets): the
 * Lead Cost total (lead sources, commissions included) plus call center,
 * software and company-wide money for the same market and window, as % of the
 * same net sales. Held and Disputed money is not in it: Disputed is not
 * charged, held money is placed on its own (and listed as a note).
 */
export type AllMarketingLine = { category: CostCategory; label: string; cost: number };
export type AllMarketing = {
  lead_cost: number;
  lines: AllMarketingLine[];
  total_cost: number;
  issued: number;
  net: number | null;
  cost_per_issued: number | null;
  mkt_pct: number | null;
  /** Held + Disputed money left out of the total. */
  parked: number;
};

const ALL_IN: readonly CostCategory[] = ["call_center", "software", "company_wide"];

export function allMarketing(
  totals: { total_cost: number; issued: number; net: number | null },
  other: OtherCosts | null,
): AllMarketing {
  const lines = ALL_IN.map((c) => ({ category: c, label: CATEGORY_LABEL[c], cost: r2(other?.by[c] ?? 0) })).filter((l) => l.cost !== 0);
  const total = r2(totals.total_cost + lines.reduce((t, l) => t + l.cost, 0));
  const net = totals.net;
  return {
    lead_cost: r2(totals.total_cost),
    lines,
    total_cost: total,
    issued: totals.issued,
    net,
    cost_per_issued: totals.issued > 0 ? r2(total / totals.issued) : null,
    mkt_pct: net != null && net > 0 ? Math.round((total / net) * 1000) / 10 : null,
    parked: r2((other?.by.held ?? 0) + (other?.by.disputed ?? 0)),
  };
}

/**
 * 12-month spend by OFFICE for the company view (the user, 2026-10-19: the
 * chart "doesn't display all colors for every market"). One series per office in
 * SCORECARD_MARKETS order (a fixed color each, --chart-cat-1..6), any other
 * market money (Houston, Winston-Salem) as "Other markets", then Held and
 * Disputed. Same money as shapeSpendTrend, split the other way.
 */
export type MarketSeries = { key: string; label: string };
export type MarketTrendPoint = { month: string; label: string; total: number } & Record<string, number | string>;

export function trendMarketSeries(officeCodes: readonly string[], officeLabel: (c: string) => string): MarketSeries[] {
  return [
    ...officeCodes.map((c) => ({ key: c, label: officeLabel(c) })),
    { key: "OTHER", label: "Other markets" },
    { key: HOLD_MARKET, label: "Held" },
    { key: DISPUTED_MARKET, label: "Disputed" },
  ];
}

export function shapeSpendTrendByMarket(
  rows: (CostRowRaw & { even_split?: boolean | null })[],
  officeCodes: readonly string[],
  months = 12,
): MarketTrendPoint[] {
  const by = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (r.grain !== "month") continue;
    if (!(parked(r.market) || inMarket(r, "REECE"))) continue;
    const key = parked(r.market) ? r.market : officeCodes.includes(r.market) ? r.market : "OTHER";
    const k = r.period_start.slice(0, 7);
    const acc = by.get(k) ?? {};
    acc[key] = (acc[key] ?? 0) + n(r.invoice_cost) + n(r.calculated_cost);
    by.set(k, acc);
  }
  const keys = [...officeCodes, "OTHER", HOLD_MARKET, DISPUTED_MARKET];
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([month, acc]) => {
    const point: MarketTrendPoint = { month, label: monthShort(month), total: 0 };
    let total = 0;
    for (const k of keys) { const v = r2(acc[k] ?? 0); point[k] = v; total += v; }
    point.total = r2(total);
    return point;
  });
}
