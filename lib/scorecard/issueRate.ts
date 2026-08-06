/**
 * Issue-rate fallback from the current report snapshots (ruled 2026-08-05 §8).
 *
 * The Leads goal is derived: leads needed = issues needed ÷ issue rate, where
 * issue rate = appointments issued ÷ raw leads in. The primary source is the
 * rolling-90-day warehouse history — but `raw_leads_in` is only populated for
 * the company row (REECE), so EVERY office resolved to a null issue rate and
 * the editor said "no leads history yet — leads goal unavailable" for all
 * seven of them.
 *
 * Until daily Lead Disposition (135) history accumulates per office, the rate
 * comes from the period-scoped totals already sitting in the current YTD
 * snapshots: Sales Efficiency (137) `issued` ÷ Lead Disposition (135) `leads`,
 * summed over the market's source codes so Orlando is (ORL+LAKE issued) ÷
 * (ORL+LAKE leads) — a ratio of sums, never an average of ratios.
 *
 * This is a FALLBACK: when the trailing window has real raw-lead history, that
 * wins, and the basis is labeled either way so nobody has to guess which
 * number they are looking at.
 */

export type IssueRateFactRow = {
  report_type: string;
  market: string;
  metric: string;
  value_count: number | null;
  scope?: string | null;
};

export type IssueRateFromFacts = {
  /** 0–1 fraction, 4dp; null when either side is missing or zero. */
  rate: number | null;
  issued: number;
  leads: number;
};

/** Scope preference for the fallback: a YTD pull is the widest honest sample. */
const SCOPE_ORDER = ["ytd", "custom", "month", "mtd"] as const;

function pickScope(rows: IssueRateFactRow[]): string | null {
  const present = new Set(rows.map((r) => r.scope ?? ""));
  for (const s of SCOPE_ORDER) if (present.has(s)) return s;
  return present.size ? [...present][0]! : null;
}

/**
 * Σ issued ÷ Σ leads for a market's source codes, from current fact rows.
 * Both sides are taken from one scope (the widest available) so the numerator
 * and denominator describe the same window.
 */
export function issueRateFromFacts(
  rows: IssueRateFactRow[],
  sources: readonly string[],
): IssueRateFromFacts {
  const inMarket = new Set(sources);
  const se = rows.filter(
    (r) => r.report_type === "sales_efficiency" && r.metric === "issued" && inMarket.has(r.market),
  );
  const ld = rows.filter(
    (r) => r.report_type === "lead_disposition" && r.metric === "leads" && inMarket.has(r.market),
  );
  const seScope = pickScope(se);
  const ldScope = pickScope(ld);
  const sum = (rs: IssueRateFactRow[], scope: string | null) =>
    rs.reduce((a, r) => (scope == null || (r.scope ?? "") === scope ? a + (r.value_count ?? 0) : a), 0);

  const issued = sum(se, seScope);
  const leads = sum(ld, ldScope);
  if (issued <= 0 || leads <= 0) return { rate: null, issued, leads };
  return { rate: Math.round((issued / leads) * 10000) / 10000, issued, leads };
}
