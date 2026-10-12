/**
 * Lead Cost view-model. What these guard:
 *   - cost per ISSUED lead, n.a. on zero,
 *   - a market shows only its own rows; REECE sums the six markets,
 *   - REECE_HOLD money is held with its recommendation, never in a market total,
 *   - † provisional carries through, aggregate periods sum their months,
 *   - the 12-month trend keeps the last 12 months in order.
 */
import { describe, expect, it } from "vitest";
import { shapeCostView, shapeTrend, shapeInvoices, na, type CostRowRaw } from "./marketingCost.core";

const row = (over: Partial<CostRowRaw> = {}): CostRowRaw => ({
  grain: "month", period_start: "2026-09-01", market: "FTMYR_MKT", lp_sub_source: "Lead Gurus",
  raw: "172", set_count: "88", issued: "36", sat: "25", sold: "4", gross: "88003", working: "36391", net: "51612",
  invoice_cost: "51580.11", calculated_cost: "0", has_provisional: true, as_of_snapshot: "2026-10-01", ...over,
});

describe("shapeCostView", () => {
  it("builds Brad's columns per sub-source with cost per issued lead and n.a. on zero", () => {
    const v = shapeCostView([
      row(),
      row({ lp_sub_source: "MVP Marketing", raw: "27", set_count: "27", issued: "8", sat: "5", sold: "1", gross: "14916", working: "0", net: "14916", invoice_cost: "0", calculated_cost: "2237.4", has_provisional: false }),
      row({ lp_sub_source: "Flyer on Door", raw: "3", set_count: "0", issued: "0", sat: "0", sold: "0", gross: null, working: null, net: null, invoice_cost: "0", calculated_cost: "0", has_provisional: false }),
    ], { market: "FTMYR_MKT", grain: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(v.rows.map((r) => r.campaign)).toEqual(["Lead Gurus", "MVP Marketing", "Flyer on Door"]);
    const lg = v.rows[0]!;
    expect(lg.cost_per_issued).toBe(1432.78);
    expect(lg.issue_pct).toBe(40.9);
    expect(lg.demo_pct).toBe(69.4);
    expect(lg.std_pct).toBe(16);
    expect(lg.nsli).toBe(1433.67);
    expect(lg.mkt_pct).toBe(99.9);
    expect(lg.provisional).toBe(true);
    const flyer = v.rows[2]!;
    expect(flyer.cost_per_issued).toBeNull();
    expect(na(flyer.cost_per_issued, String)).toBe("n.a.");
    expect(flyer.net).toBeNull();
    expect(v.totals.issued).toBe(44);
    expect(v.totals.total_cost).toBe(53817.51);
    expect(v.as_of_snapshot).toBe("2026-10-01");
    expect(v.any_cost).toBe(true);
  });

  it("keeps markets apart, sums them for REECE, and holds REECE_HOLD out of every total", () => {
    const rows = [
      row(), row({ market: "SAR_MKT", raw: "100", issued: "20", invoice_cost: "24268.64", net: "25000", gross: "30000", working: "5000" }),
      row({ market: "REECE_HOLD", lp_sub_source: "Lead Gurus", raw: "0", issued: "0", invoice_cost: "2529.34", net: null, gross: null, working: null, recommended_market: "FTMYR_MKT", recommendation_reason: "FTMYR_MKT 3/3 leads" }),
    ];
    const ftmyr = shapeCostView(rows, { market: "FTMYR_MKT", grain: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(ftmyr.totals.total_cost).toBe(51580.11);
    expect(ftmyr.held).toEqual({ total_cost: 2529.34, recommended_market: "FTMYR_MKT", recommendation_reason: "FTMYR_MKT 3/3 leads" });
    const reece = shapeCostView(rows, { market: "REECE", grain: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(reece.rows).toHaveLength(1);
    expect(reece.rows[0]!.issued).toBe(56);
    expect(reece.totals.total_cost).toBe(75848.75);
    expect(reece.held?.total_cost).toBe(2529.34);
  });

  it("sums the months of an aggregate period and ignores the other grain", () => {
    const rows = [row(), row({ period_start: "2026-08-01", invoice_cost: "40000", issued: "30" }), row({ grain: "iso_week", period_start: "2026-09-21", invoice_cost: "999" })];
    const v = shapeCostView(rows, { market: "FTMYR_MKT", grain: "month", periodStart: "2026-07-01", periodEnd: "2026-09-30" });
    expect(v.rows[0]!.issued).toBe(66);
    expect(v.rows[0]!.invoice_cost).toBe(91580.11);
    const w = shapeCostView(rows, { market: "FTMYR_MKT", grain: "week", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(w.rows[0]!.invoice_cost).toBe(999);
  });

  it("empty rows are not a cost", () => {
    const v = shapeCostView([], { market: "FTMYR_MKT", grain: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    expect(v.rows).toEqual([]);
    expect(v.any_cost).toBe(false);
    expect(v.held).toBeNull();
  });
});

describe("shapeTrend", () => {
  it("keeps the last 12 months in order with cost per issued", () => {
    const rows: CostRowRaw[] = [];
    for (let m = 1; m <= 14; m++) {
      const ym = m <= 12 ? `2025-${String(m).padStart(2, "0")}-01` : `2026-${String(m - 12).padStart(2, "0")}-01`;
      rows.push(row({ period_start: ym, invoice_cost: String(m * 100), issued: String(m) }));
      rows.push(row({ period_start: ym, market: "SAR_MKT", invoice_cost: "10", issued: "1" }));
    }
    const t = shapeTrend(rows, "FTMYR_MKT");
    expect(t).toHaveLength(12);
    expect(t[0]!.month).toBe("2025-03");
    expect(t[11]!).toEqual({ month: "2026-02", label: "Feb 26", total_cost: 1400, cost_per_issued: 100, issued: 14 });
    expect(shapeTrend(rows, "REECE")[11]!.total_cost).toBe(1410);
  });
});

describe("shapeInvoices", () => {
  it("reads the facts out of the analysis and names the vendor", () => {
    const d = shapeInvoices([{
      id: "d1", status: "in_review", from_address: "ar@leadgurus.com", subject: "Invoice", received_at: "2026-10-03T12:00:00Z", file_name: "x.pdf",
      analyzer: "rules+llm", analysis: { facts: { total: "1000.5", invoice_number: "LG-9", period_start: "2026-09-01", period_end: "2026-09-30" }, vendor_id: "v1", flags: ["low_confidence"] },
      extracted_text: "hello", storage_path: "2026/10/abc.pdf", created_at: "2026-10-03T12:00:01Z",
    }], { v1: "Lead Gurus" })[0]!;
    expect(d.vendor).toBe("Lead Gurus");
    expect(d.total).toBe(1000.5);
    expect(d.period).toBe("2026-09-01 → 2026-09-30");
    expect(d.flags).toEqual(["low_confidence"]);
    expect(d.has_file).toBe(true);
  });
});
