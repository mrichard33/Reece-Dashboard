import { describe, expect, test } from "vitest";
import { issueRateFromFacts, type IssueRateFactRow } from "./issueRate";
import { marketSources } from "./markets";

/**
 * §8 (2026-08-05): every office resolved to a null issue rate — `raw_leads_in`
 * is only ever written for the company row — so the goal editor said "no leads
 * history yet" and the Leads goal was unavailable for all seven markets. The
 * fallback reads the current YTD snapshots instead.
 *
 * Figures below are the live 2026-08-05 facts.
 */

const f = (
  report_type: string,
  market: string,
  metric: string,
  value_count: number,
  scope = "ytd",
): IssueRateFactRow => ({ report_type, market, metric, value_count, scope });

const LIVE: IssueRateFactRow[] = [
  // 137 issued, per branch-grain row
  f("sales_efficiency", "ORL_MKT", "issued", 2948),
  f("sales_efficiency", "LAKE_MKT", "issued", 439),
  f("sales_efficiency", "SAR_MKT", "issued", 1783),
  f("sales_efficiency", "FTLAU_MKT", "issued", 763),
  f("sales_efficiency", "FTLAU_MKT", "issued", 216),
  f("sales_efficiency", "FTLAU_MKT", "issued", 463),
  f("sales_efficiency", "FTLAU_MKT", "issued", 7),
  // 135 leads
  f("lead_disposition", "ORL_MKT", "leads", 16527),
  f("lead_disposition", "ORL_MKT", "leads", 28),
  f("lead_disposition", "LAKE_MKT", "leads", 2899),
  f("lead_disposition", "LAKE_MKT", "leads", 28),
  f("lead_disposition", "SAR_MKT", "leads", 6418),
  f("lead_disposition", "SAR_MKT", "leads", 30),
];

describe("issue-rate fallback from current report snapshots", () => {
  test("resolves for a single-source office", () => {
    const r = issueRateFromFacts(LIVE, marketSources("SAR_MKT"));
    expect(r.issued).toBe(1783);
    expect(r.leads).toBe(6448);
    expect(r.rate).toBeCloseTo(1783 / 6448, 4);
  });

  // LAKELAND RULING (2026-08-06): Orlando's issue rate is ORL's alone. The
  // ratio-of-sums discipline still applies WITHIN a market — a market's several
  // branch-grain rows sum before the division, never averaging two rates.
  test("Orlando is ORL issued ÷ ORL leads, with Lakeland excluded", () => {
    const r = issueRateFromFacts(LIVE, marketSources("ORL_MKT"));
    expect(r.issued).toBe(2948);
    expect(r.leads).toBe(16527 + 28); // branch rows sum, then divide
    expect(r.rate).toBeCloseTo(2948 / 16555, 4);
  });

  test("Lakeland resolves its own issue rate", () => {
    const r = issueRateFromFacts(LIVE, marketSources("LAKE_MKT"));
    expect(r.issued).toBe(439);
    expect(r.leads).toBe(2899 + 28);
    expect(r.rate).toBeCloseTo(439 / 2927, 4);
  });

  test("Fort Lauderdale is a ratio of sums over its folded branch rows", () => {
    // FTLAU is the one remaining multi-branch market (BOCA/MIAMI/RFED fold
    // upstream): sum the branch rows, then divide — never average the rates.
    const r = issueRateFromFacts(LIVE, marketSources("FTLAU_MKT"));
    expect(r.issued).toBe(763 + 216 + 463 + 7);
  });

  test("branch-grain rows for one market are summed, not taken one at a time", () => {
    const r = issueRateFromFacts(
      [...LIVE, f("lead_disposition", "FTLAU_MKT", "leads", 10531)],
      ["FTLAU_MKT"],
    );
    expect(r.issued).toBe(763 + 216 + 463 + 7);
  });

  test("a missing side yields null, never a fabricated rate", () => {
    expect(issueRateFromFacts(LIVE, ["JAX_MKT"]).rate).toBeNull();
    expect(issueRateFromFacts([], ["SAR_MKT"]).rate).toBeNull();
  });

  test("numerator and denominator come from ONE scope — never mixed windows", () => {
    const mixed: IssueRateFactRow[] = [
      f("sales_efficiency", "SAR_MKT", "issued", 1783, "ytd"),
      f("sales_efficiency", "SAR_MKT", "issued", 42, "mtd"),
      f("lead_disposition", "SAR_MKT", "leads", 6448, "ytd"),
      f("lead_disposition", "SAR_MKT", "leads", 210, "mtd"),
    ];
    const r = issueRateFromFacts(mixed, ["SAR_MKT"]);
    expect(r.issued).toBe(1783);
    expect(r.leads).toBe(6448);
  });
});
