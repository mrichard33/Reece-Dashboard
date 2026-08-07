/**
 * Daily view — yesterday's volumes, and NOTHING else.
 *
 * No goal. No pace. No projection. No variance. A single selling day is too
 * noisy to pace against, and pacing against it is how the page ends up
 * reporting a crisis every Tuesday. The floor needs to know what happened
 * yesterday; they do not need a month-end forecast computed off one day.
 *
 * MECHANICS: `lp_market_scorecard_daily` stores CUMULATIVE month-to-date rows,
 * one set per as-of date — so a single day's activity is the delta between
 * consecutive as-of snapshots WITHIN one period_start. Crossing a month
 * boundary would subtract last month's cumulative total from this month's and
 * print a large negative number, so the delta is only ever taken inside one
 * period. When no prior snapshot exists in the period (the 1st, or a gap), the
 * view says which window the figures actually cover instead of pretending the
 * cumulative figure is one day's work.
 */
import { measured, unmeasured, type Measured } from "./types";
import { displayMarketOf } from "@/lib/scorecard/markets";

export type DailySnapshotRow = {
  market: string;
  as_of_date: string;
  period_start: string;
  leads: number | null;
  raw_leads_in: number | null;
  sets: number | null;
  issued: number | null;
  demos: number | null;
  sales: number | null;
};

export type DailyVolumes = {
  leads: Measured;
  sets: Measured;
  issued: Measured;
  demos: Measured;
  sales: Measured;
};

export type DailyRow = { market: string; label: string; isCompany: boolean } & DailyVolumes;

export type DailyView = {
  /** The date the volumes describe. */
  asOf: string | null;
  /** True when figures are a true single-day delta; false when cumulative. */
  isSingleDay: boolean;
  /** Stated on the header — always says exactly what the numbers cover. */
  windowLabel: string;
  rows: DailyRow[];
  company: DailyRow | null;
};

const FIELDS = ["leads", "sets", "issued", "demos", "sales"] as const;
type Field = (typeof FIELDS)[number];

/** Prefer true raw leads in; fall back to the appointment-set cohort. */
const leadCountOf = (r: DailySnapshotRow): number | null => r.raw_leads_in ?? r.leads;

function pickField(r: DailySnapshotRow, f: Field): number | null {
  return f === "leads" ? leadCountOf(r) : r[f];
}

/**
 * Build the daily view from cumulative snapshot rows.
 *
 * Rows may span several as-of dates; the two most recent WITHIN the newest
 * period_start are used. Markets are collapsed to display entities first, so
 * OUT_OF_AREA folds into UNASSIGNED before any subtraction happens. LAKE_MKT
 * does NOT fold — Lakeland is its own market (markets.ts, 2026-08-06).
 */
export function buildDailyView(rows: readonly DailySnapshotRow[]): DailyView {
  if (!rows.length) {
    return {
      asOf: null,
      isSingleDay: false,
      windowLabel: "no daily snapshot available yet",
      rows: [],
      company: null,
    };
  }

  const latestPeriod = rows.reduce((a, r) => (r.period_start > a ? r.period_start : a), rows[0]!.period_start);
  const inPeriod = rows.filter((r) => r.period_start === latestPeriod);
  const dates = [...new Set(inPeriod.map((r) => r.as_of_date))].sort();
  const latest = dates[dates.length - 1]!;
  const prior = dates.length >= 2 ? dates[dates.length - 2]! : null;

  // Collapse to display markets BEFORE differencing.
  const fold = (asOf: string): Map<string, Record<Field, number | null>> => {
    const out = new Map<string, Record<Field, number | null>>();
    for (const r of inPeriod) {
      if (r.as_of_date !== asOf) continue;
      // The stored REECE row is a company rollup, not a market — it would
      // double the totals if folded in alongside the offices.
      if (r.market === "REECE") continue;
      const key = displayMarketOf(r.market);
      const acc = out.get(key) ?? { leads: null, sets: null, issued: null, demos: null, sales: null };
      for (const f of FIELDS) {
        const v = pickField(r, f);
        if (v != null) acc[f] = (acc[f] ?? 0) + v;
      }
      out.set(key, acc);
    }
    return out;
  };

  const now = fold(latest);
  const before = prior ? fold(prior) : null;
  const isSingleDay = before !== null;

  const noData = "no volume reported for this market on this date";
  const toRow = (market: string, vals: Record<Field, number | null>): DailyRow => {
    const base = { market, label: market, isCompany: false };
    const out = {} as DailyVolumes;
    for (const f of FIELDS) {
      const v = vals[f];
      out[f] = v == null ? unmeasured<number>(noData) : measured(v);
    }
    return { ...base, ...out };
  };

  const markets = [...now.keys()].sort();
  const deltaFor = (market: string): Record<Field, number | null> => {
    const cur = now.get(market)!;
    if (!before) return cur;
    const prev = before.get(market);
    const out = { leads: null, sets: null, issued: null, demos: null, sales: null } as Record<Field, number | null>;
    for (const f of FIELDS) {
      if (cur[f] == null) continue;
      // A negative delta means the upstream figure was restated downward; clamp
      // to zero rather than printing "-3 sales", which reads as a data error to
      // the floor and is not actionable either way.
      out[f] = Math.max(0, cur[f]! - (prev?.[f] ?? 0));
    }
    return out;
  };

  const marketRows = markets.map((m) => toRow(m, deltaFor(m)));

  const companyVals = { leads: null, sets: null, issued: null, demos: null, sales: null } as Record<Field, number | null>;
  for (const m of markets) {
    const v = deltaFor(m);
    for (const f of FIELDS) if (v[f] != null) companyVals[f] = (companyVals[f] ?? 0) + v[f]!;
  }
  const company: DailyRow = { ...toRow("REECE", companyVals), label: "All Markets", isCompany: true };

  return {
    asOf: latest,
    isSingleDay,
    windowLabel: isSingleDay
      ? `activity on ${latest}`
      : `cumulative ${latestPeriod} → ${latest} — only one snapshot exists in this period, so a single-day delta is not yet computable`,
    rows: marketRows,
    company,
  };
}
