/**
 * Marketing Spend view-model (2026-10-19). What these guard:
 *   - every category branch, case-insensitive, held before anything else,
 *   - Lead Cost keeps lead-source money only, and "Other marketing costs" is
 *     exactly the money it dropped,
 *   - commissions are lead-source cost (the user, 2026-10-19, reversing the
 *     same morning's separate Commissions category), and the Canvass
 *     estimate is marked,
 *   - the Spend tiles add up to the total,
 *   - Unbounce invoice 400 ($97.78 in Oct 2026, six offices) is Software and
 *     never inside Lead Cost.
 */
import { describe, expect, it } from "vitest";
import type { CostRowRaw } from "./marketingCost.core";
import { shapeSpendTrendByMarket, allMarketing,
  costCategory,
  costParts,
  markEvenSplit,
  leadOnlyRows,
  otherCosts,
  shapeLeadCostView,
  shapeLeadTrend,
  allocationInWindow,
  shapeSpend,
  shapeSpendTrend,
  plainHoldDescription,
  plainHoldReason,
  CATEGORY_ORDER,
  type AllocationRaw,
} from "./marketingSpend.core";

const OFFICES = ["STPET_MKT", "ORL_MKT", "FTMYR_MKT", "JAX_MKT", "SAR_MKT", "FTLAU_MKT"] as const;

const row = (over: Partial<CostRowRaw> = {}): CostRowRaw => ({
  grain: "month", period_start: "2026-10-01", market: "FTMYR_MKT", lp_sub_source: "Lead Gurus",
  raw: "101", set_count: "60", issued: "20", sat: "10", sold: "2", gross: null, working: null, net: null,
  invoice_cost: "30016.19", calculated_cost: "0", has_provisional: false, as_of_snapshot: null, ...over,
});
const software = (market: string, amt: string, month = "2026-10-01"): CostRowRaw =>
  row({ market, period_start: month, lp_sub_source: "Software", raw: "0", set_count: "0", issued: "0", sat: "0", sold: "0", invoice_cost: amt });

// Unbounce as it sits in the live view: $149 over Oct 11 → Nov 11, six offices, equal split.
const UNBOUNCE_OCT = [["FTLAU_MKT", "16.33"], ["FTMYR_MKT", "16.29"], ["JAX_MKT", "16.29"], ["ORL_MKT", "16.29"], ["SAR_MKT", "16.29"], ["STPET_MKT", "16.29"]] as const;
const UNBOUNCE_NOV = [["FTLAU_MKT", "8.57"], ["FTMYR_MKT", "8.53"], ["JAX_MKT", "8.53"], ["ORL_MKT", "8.53"], ["SAR_MKT", "8.53"], ["STPET_MKT", "8.53"]] as const;

const OCT = { market: "REECE", grain: "month" as const, periodStart: "2026-10-01", periodEnd: "2026-10-18" };

describe("costCategory", () => {
  it("sorts every branch, case-insensitive", () => {
    expect(costCategory({ market: "REECE_HOLD", lp_sub_source: "Lead Gurus" })).toBe("held");
    expect(costCategory({ market: "REECE_HOLD", lp_sub_source: "Canvass" }, "calculated")).toBe("held");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "Software" })).toBe("software");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "SOFTWARE" })).toBe("software");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "call center" })).toBe("call_center");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "Company-wide" })).toBe("company_wide");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "(none)", even_split: true })).toBe("company_wide");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: null, even_split: true })).toBe("company_wide");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "(none)" })).toBe("lead_source");
    // 2026-10-19 (the user): a commission is its lead source's cost, not a category of its own.
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "Canvass" }, "calculated")).toBe("lead_source");
    expect(costCategory({ market: "SAR_MKT", lp_sub_source: "Lead Gurus" })).toBe("lead_source");
  });

  it("keeps a row's invoice and calculated (commission) cost as two lead-source parts", () => {
    expect(costParts(row({ lp_sub_source: "MVP Marketing", invoice_cost: "100", calculated_cost: "2237.4" }))).toEqual([
      { category: "lead_source", amount: 100 },
      { category: "lead_source", amount: 2237.4 },
    ]);
    expect(costParts(row({ invoice_cost: "0", calculated_cost: "0" }))).toEqual([]);
  });

  it("marks a (none) row as Company-wide only where an even split landed", () => {
    const rows = markEvenSplit([
      row({ lp_sub_source: "(none)", market: "SAR_MKT" }),
      row({ lp_sub_source: "(none)", market: "JAX_MKT" }),
      row({ lp_sub_source: "(none)", market: "SAR_MKT", grain: "iso_week", period_start: "2026-09-28" }),
      row({ lp_sub_source: "Lead Gurus", market: "SAR_MKT" }),
    ], new Set(["2026-10|SAR_MKT"]));
    expect(rows.map((r) => r.even_split)).toEqual([true, false, true, false]);
  });
});

describe("Lead Cost = lead sources only", () => {
  const rows: CostRowRaw[] = [
    row(),
    row({ market: "SAR_MKT", invoice_cost: "14813.19", issued: "15" }),
    row({ lp_sub_source: "Canvass", invoice_cost: "0", calculated_cost: "48358.5", issued: "207", raw: "300" }),
    row({ lp_sub_source: "Call Center", raw: "0", issued: "0", invoice_cost: "500" }),
    row({ market: "REECE_HOLD", invoice_cost: "62.67", issued: "0", raw: "0" }),
    ...UNBOUNCE_OCT.map(([m, a]) => software(m, a)),
    ...UNBOUNCE_NOV.map(([m, a]) => software(m, a, "2026-11-01")),
  ];

  it("drops non-lead rows from the table, the totals and cost per issued lead; commissions stay", () => {
    const { view } = shapeLeadCostView(rows, OCT);
    expect(view.rows.map((r) => r.campaign)).toEqual(["Canvass", "Lead Gurus"]);
    expect(view.rows.find((r) => r.campaign === "Software")).toBeUndefined();
    const canvass = view.rows.find((r) => r.campaign === "Canvass")!;
    expect(canvass.calculated_cost).toBe(48358.5); // the commission is Canvass's cost (2026-10-19)
    expect(canvass.total_cost).toBe(48358.5);
    expect(canvass.issued).toBe(207);
    expect(view.totals.total_cost).toBe(93187.88); // 30016.19 + 14813.19 + 48358.5
    expect(view.totals.total_cost).toBe(view.rows.reduce((s, r) => s + r.total_cost, 0));
    expect(view.totals.cost_per_issued).toBe(Math.round((93187.88 / 242) * 100) / 100);
    expect(view.held?.total_cost).toBe(62.67); // held keeps its own line
  });

  it("the Other line is exactly the money Lead Cost dropped", () => {
    const { view, other } = shapeLeadCostView(rows, OCT);
    expect(other.by.software).toBe(97.78);
    expect(other.by.call_center).toBe(500);
    expect(other.by.lead_source).toBe(0); // commissions are not "other" any more
    expect(other.by.held).toBe(62.67); // held moved off the scorecard, so it sums in here (company view)
    expect(other.total).toBe(660.45);
    const everything = shapeLeadCostView(rows.map((r) => r), OCT); // same input, unchanged
    expect(everything.view.totals.total_cost).toBe(view.totals.total_cost);
    // Full ledger for REECE = lead total + other.
    const full = rows.filter((r) => r.period_start === "2026-10-01")
      .reduce((s, r) => s + Number(r.invoice_cost) + Number(r.calculated_cost), 0);
    expect(Math.round((view.totals.total_cost + other.total) * 100) / 100).toBe(Math.round(full * 100) / 100);
  });

  it("one market sees its own share only", () => {
    const sar = otherCosts(rows, { ...OCT, market: "SAR_MKT" });
    expect(sar.by.software).toBe(16.29);
    expect(sar.total).toBe(16.29);
  });

  it("Unbounce never reaches the Lead Cost trend", () => {
    const t = shapeLeadTrend(rows, "REECE");
    expect(t.find((p) => p.month === "2026-11")!.total_cost).toBe(0);
    expect(t.find((p) => p.month === "2026-10")!.total_cost).toBe(93187.88);
  });

  it("leaves held rows and lead counts untouched", () => {
    const out = leadOnlyRows(rows);
    expect(out[4]).toBe(rows[4]);
    expect(out[2]!.issued).toBe("207");
  });
});

const alloc = (over: Partial<AllocationRaw> & { e?: Partial<NonNullable<AllocationRaw["marketing_expenses"]>> } = {}): AllocationRaw => {
  const { e, ...rest } = over;
  return {
    id: Math.random().toString(36), month: "2026-10-01", market: "FTMYR_MKT", lp_sub_source: "Lead Gurus", amount: "100", rule: "proportional",
    marketing_expenses: { vendor_id: "lg", cost_type: "feed", status: "approved", period_start: "2026-10-01", period_end: "2026-10-31", ...e },
    ...rest,
  };
};
const VENDORS = { lg: "Lead Gurus", ub: "Unbounce", cv: "Canvass (commission)", mod: "Modernize" };
const unbounceAllocs = [
  ...UNBOUNCE_OCT.map(([m, a]) => alloc({ market: m, lp_sub_source: "Software", amount: a, rule: "equal", e: { vendor_id: "ub", cost_type: "invoice", period_start: "2026-10-11", period_end: "2026-11-11" } })),
  ...UNBOUNCE_NOV.map(([m, a]) => alloc({ month: "2026-11-01", market: m, lp_sub_source: "Software", amount: a, rule: "equal", e: { vendor_id: "ub", cost_type: "invoice", period_start: "2026-10-11", period_end: "2026-11-11" } })),
];

describe("shapeSpend", () => {
  const allocs: AllocationRaw[] = [
    alloc({ amount: "30016.19" }),
    alloc({ market: "SAR_MKT", amount: "14813.19" }),
    alloc({ market: "SAR_MKT", lp_sub_source: "Modernize", amount: "192.45", e: { vendor_id: "mod", cost_type: "invoice" } }),
    alloc({ lp_sub_source: "Canvass", amount: "48358.5", rule: "direct", e: { vendor_id: "cv", cost_type: "calculated", provisional: true, flags: ["estimate"] } }),
    alloc({ market: "REECE_HOLD", amount: "62.67", rule: "hold" }),
    alloc({ market: "SAR_MKT", amount: "999", e: { status: "rejected" } }),
    alloc({ month: "2026-09-01", amount: "5000" }),
    ...unbounceAllocs,
  ];

  it("Unbounce is Software, $97.78 in October, one line per office", () => {
    const v = shapeSpend(allocs, VENDORS, { ...OCT, markets: OFFICES });
    expect(v.tiles.software).toBe(97.78);
    const sw = v.groups.find((g) => g.category === "software")!;
    expect(sw.vendors.map((x) => x.vendor)).toEqual(["Unbounce"]);
    for (const m of OFFICES) {
      expect(sw.byMarket[m]).toBeGreaterThanOrEqual(16.29);
      expect(sw.byMarket[m]).toBeLessThanOrEqual(16.33);
    }
    expect(sw.byMarket.REECE_HOLD).toBe(0);
    expect(v.groups.find((g) => g.category === "lead_source")!.vendors.some((x) => x.vendor === "Unbounce")).toBe(false);
  });

  it("tiles add up to the total; approved rows in the window only", () => {
    const v = shapeSpend(allocs, VENDORS, { ...OCT, markets: OFFICES });
    const sum = CATEGORY_ORDER.reduce((s, k) => s + v.tiles[k], 0);
    expect(Math.round(sum * 100) / 100).toBe(v.tiles.total);
    expect(v.tiles.total).toBe(93540.78); // 30016.19 + 14813.19 + 192.45 + 48358.5 + 62.67 + 97.78
    expect(v.tiles.lead_source).toBe(93380.33); // lead invoices + feed + the Canvass commission
    expect(v.tiles.held).toBe(62.67);
    expect(v.columns).toEqual([...OFFICES, "REECE_HOLD"]);
    expect(v.groups.map((g) => g.category)).toEqual(["lead_source", "software", "held"]);
    const lead = v.groups.find((g) => g.category === "lead_source")!;
    expect(lead.vendors.map((x) => x.vendor)).toEqual(["Canvass (commission)", "Lead Gurus", "Modernize"]);
    // The Canvass commission is a 15% estimate until canvasser payroll: marked, nothing else is.
    expect(lead.vendors.map((x) => x.estimate)).toEqual([true, false, false]);
    expect(lead.vendors[0]!.subSources[0]!.estimate).toBe(true);
    expect(lead.byMarket.SAR_MKT).toBe(15005.64);
    // Every row's cells add up to its total.
    for (const g of v.groups) expect(Math.round(Object.values(g.byMarket).reduce((s, x) => s + x, 0) * 100) / 100).toBe(g.total);
  });

  it("a single market shows its own column and no held money", () => {
    const v = shapeSpend(allocs, VENDORS, { ...OCT, market: "SAR_MKT", markets: OFFICES });
    expect(v.columns).toEqual(["SAR_MKT"]);
    expect(v.tiles.held).toBe(0);
    expect(v.tiles.software).toBe(16.29);
    expect(v.tiles.total).toBe(15021.93);
  });

  it("an unknown vendor still counts", () => {
    const v = shapeSpend([alloc({ e: { vendor_id: null } })], VENDORS, { ...OCT, markets: OFFICES });
    expect(v.groups[0]!.vendors[0]!.vendor).toBe("Unknown vendor");
  });
});

describe("allocationInWindow", () => {
  const a = unbounceAllocs[0]!; // FTLAU Oct, $16.33 over Oct 11–31 (21 days)
  it("month grain takes the whole month", () => {
    expect(allocationInWindow(a, "month", "2026-10-01", "2026-10-18")).toBe(16.33);
    expect(allocationInWindow(a, "month", "2026-11-01", "2026-11-30")).toBe(0);
  });
  it("week grain spreads the slice by day like the view", () => {
    // Weeks starting Oct 12 (Mon) .. Oct 18: days Oct 11 (week of Oct 5) excluded? Oct 11 is a Sunday in the week of Oct 5.
    const wk = allocationInWindow(a, "week", "2026-10-12", "2026-10-18");
    expect(Math.round(wk * 100) / 100).toBe(Math.round((16.33 / 21) * 7 * 100) / 100);
    const all = allocationInWindow(a, "week", "2026-10-05", "2026-10-31");
    expect(Math.round(all * 100) / 100).toBe(16.33);
  });
});

describe("shapeSpendTrend", () => {
  it("stacks by category, held only for the company", () => {
    const rows = [
      row(), row({ lp_sub_source: "Canvass", invoice_cost: "0", calculated_cost: "48358.5" }),
      row({ market: "REECE_HOLD", invoice_cost: "62.67" }),
      ...UNBOUNCE_OCT.map(([m, a]) => software(m, a)),
      ...UNBOUNCE_NOV.map(([m, a]) => software(m, a, "2026-11-01")),
    ];
    const t = shapeSpendTrend(rows, "REECE");
    expect(t.map((p) => p.month)).toEqual(["2026-10", "2026-11"]);
    expect(t[0]).toMatchObject({ lead_source: 78374.69, software: 97.78, held: 62.67, total: 78535.14 }); // commission folded into lead sources (2026-10-19)
    expect(t[1]).toMatchObject({ software: 51.22, total: 51.22 });
    expect(shapeSpendTrend(rows, "FTMYR_MKT")[0]).toMatchObject({ held: 0, software: 16.29 });
  });
});

describe("held spend in plain words", () => {
  const label = (c: string) => ({ JAX_MKT: "Jacksonville", ORL_MKT: "Orlando", STPET_MKT: "St. Petersburg" } as Record<string, string>)[c] ?? c;
  it("describes the feed rows", () => {
    expect(plainHoldDescription("Lead Gurus feed 2026-10-17 · not attributed to any territory (daily total − territories)"))
      .toBe("Lead Gurus spend on Oct 17 that Lead Gurus did not tag to an office");
    expect(plainHoldDescription("Lead Gurus feed 2026-09-22 · Unknown")).toBe('Lead Gurus spend on Sep 22 in their "Unknown" territory');
    expect(plainHoldDescription("Something else")).toBe("Something else");
  });
  it("names offices and lead shares, never codes or prospect ids", () => {
    const r = plainHoldReason("ORL_MKT,STPET_MKT", "day gap; held leads that day: ORL_MKT 1/2 lead, STPET_MKT 1/2 lead — matched LP Prospect 464679, branch STPET", label);
    expect(r).toBe("Suggested: Orlando (1 of 2), St. Petersburg (1 of 2), by the Lead Gurus leads from that day we matched in LP.");
    expect(r).not.toMatch(/_MKT|Prospect/);
    expect(plainHoldReason(null, "no match — needs manual pick", label)).toMatch(/person has to pick/);
  });
});

// 2026-10-19 (the user): an invoice accepted as received parks what was billed
// but not found (12 demos billed, 9 found) as Disputed: company level, its own
// column and tile, never in an office's cost.
describe("disputed money", () => {
  const lf = { vendor_id: "lf", cost_type: "invoice" as const, period_start: "2026-10-01", period_end: "2026-10-08" };
  const allocs = [
    alloc({ market: "SAR_MKT", lp_sub_source: "Call Center", amount: "2250", rule: "proportional", e: lf }),
    alloc({ market: "DISPUTED", lp_sub_source: "Call Center", amount: "750", rule: "hold", e: lf }),
  ];
  it("is its own category, column and tile in the company view; tiles still sum to the total", () => {
    const v = shapeSpend(allocs, { lf: "LightFire Partners" }, { ...OCT, markets: OFFICES });
    expect(v.columns.at(-1)).toBe("DISPUTED");
    expect(v.tiles.disputed).toBe(750);
    expect(v.tiles.call_center).toBe(2250);
    expect(v.tiles.total).toBe(3000);
    expect(costCategory({ market: "DISPUTED", lp_sub_source: "Call Center" })).toBe("disputed");
  });
  it("is never in an office's view, and there is no Disputed column when nothing is disputed", () => {
    const sar = shapeSpend(allocs, { lf: "LightFire Partners" }, { ...OCT, market: "SAR_MKT", markets: OFFICES });
    expect(sar.tiles.total).toBe(2250);
    const clean = shapeSpend(allocs.slice(0, 1), { lf: "LightFire Partners" }, { ...OCT, markets: OFFICES });
    expect(clean.columns).not.toContain("DISPUTED");
  });
});

describe("allMarketing (2026-10-19: lead sources + call center + software, both targets)", () => {
  const by = { lead_source: 0, software: 809, call_center: 33153, company_wide: 0, held: 120, disputed: 750 };
  it("adds call center and software to the lead-source total; held and disputed stay out", () => {
    const a = allMarketing({ total_cost: 692496, issued: 1000, net: 3668298 }, { total: 34832, by });
    expect(a.lines.map((l) => [l.category, l.cost])).toEqual([["call_center", 33153], ["software", 809]]);
    expect(a.total_cost).toBe(726458);
    expect(a.mkt_pct).toBe(19.8);
    expect(a.cost_per_issued).toBe(726.46);
    expect(a.parked).toBe(870);
  });
  it("no net, no Mkt %; no other costs, no extra lines", () => {
    const a = allMarketing({ total_cost: 100, issued: 0, net: null }, null);
    expect([a.lines.length, a.mkt_pct, a.cost_per_issued, a.total_cost]).toEqual([0, null, null, 100]);
  });
});

describe("shapeSpendTrendByMarket (12-month chart, one color per office)", () => {
  const r = (market: string, month: string, invoice_cost: number) => ({ grain: "month", market, lp_sub_source: "X", period_start: month, invoice_cost, calculated_cost: 0 } as unknown as CostRowRaw);
  it("one series per office, other markets folded, held and disputed kept apart; totals add up", () => {
    const pts = shapeSpendTrendByMarket([
      r("ORL_MKT", "2026-09-01", 100), r("SAR_MKT", "2026-09-01", 50), r("HOU_MKT", "2026-09-01", 7),
      r("REECE_HOLD", "2026-09-01", 3), r("DISPUTED", "2026-09-01", 9), r("ORL_MKT", "2026-10-01", 20),
    ], ["STPET_MKT", "ORL_MKT", "SAR_MKT"]);
    expect(pts.map((p) => p.month)).toEqual(["2026-09", "2026-10"]);
    expect(pts[0]).toMatchObject({ ORL_MKT: 100, SAR_MKT: 50, STPET_MKT: 0, OTHER: 7, REECE_HOLD: 3, DISPUTED: 9, total: 169 });
  });
});
