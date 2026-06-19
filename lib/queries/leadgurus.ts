import { lpService } from "@/lib/supabase/lp";

/**
 * Paid Media (Lead Gurus) queries — read the `ft_*` ingest tables that the n8n
 * workflow "I.LG — Lead Gurus Daily Pull" populates daily via LP-MCP
 * `/n8n/leadgurus/daily-pull`. All reads go through the LP service-role client.
 *
 * Postgres `numeric(14,2)` columns arrive as strings over PostgREST, so every
 * money/ratio field is coerced to `number | null` here before it reaches the UI.
 */

const BUSINESS_TZ = "America/New_York";
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD (America/New_York) for `at`. */
function etYmd(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export type FtDaily = {
  date: string;
  total_leads: number | null;
  total_spend: number | null;
  cost_per_lead: number | null;
  self_book_count: number | null;
  cost_per_self_book: number | null;
  demos: number | null;
  gross_amount: number | null;
  net_amount: number | null;
};

export type FtTerritory = {
  date: string;
  territory: string;
  total_leads: number | null;
  total_spend: number | null;
  cost_per_lead: number | null;
  self_book_count: number | null;
  demos: number | null;
  gross_amount: number | null;
};

export type LeadGurusSummary = {
  latest: FtDaily | null;
  trend: { date: string; spend: number; revenue: number }[];
  territories: FtTerritory[];
};

const DAILY_COLS =
  "date,total_leads,total_spend,cost_per_lead,self_book_count,cost_per_self_book,demos,gross_amount,net_amount";
const TERR_COLS =
  "date,territory,total_leads,total_spend,cost_per_lead,self_book_count,demos,gross_amount";

function mapDaily(r: Record<string, unknown>): FtDaily {
  return {
    date: String(r.date),
    total_leads: n(r.total_leads),
    total_spend: n(r.total_spend),
    cost_per_lead: n(r.cost_per_lead),
    self_book_count: n(r.self_book_count),
    cost_per_self_book: n(r.cost_per_self_book),
    demos: n(r.demos),
    gross_amount: n(r.gross_amount),
    net_amount: n(r.net_amount),
  };
}

/**
 * Latest day's headline metrics, a `days`-day spend-vs-revenue trend, and the
 * per-territory breakdown for the most recent pulled date. Resilient to an
 * empty table (returns `latest: null`), so the section can render a placeholder.
 */
export async function getLeadGurusSummary(days = 30): Promise<LeadGurusSummary> {
  const sb = lpService();
  const sinceYmd = etYmd(new Date(Date.now() - days * DAY_MS));

  const { data: dailyRaw, error } = await sb
    .from("ft_daily_summary")
    .select(DAILY_COLS)
    .gte("date", sinceYmd)
    .order("date", { ascending: true });
  if (error) throw new Error(`ft_daily_summary read: ${error.message}`);

  const daily = ((dailyRaw ?? []) as Record<string, unknown>[]).map(mapDaily);
  // The current day's row is partial until that day's pull finalizes — it reads
  // near-zero (no leads, no revenue) and looks like "no data loaded". Anchor the
  // section on the most recent day that actually has leads pulled; fall back to
  // the raw latest row only if every in-range day is empty.
  const latest =
    [...daily].reverse().find((d) => (d.total_leads ?? 0) > 0) ??
    daily[daily.length - 1] ??
    null;
  // Keep the trend in step with `latest` so the chart doesn't trail off into the
  // partial current day after the tiles have settled on the last complete one.
  const visible = latest
    ? daily.filter((d) => d.date <= latest.date)
    : daily;
  const trend = visible.map((d: FtDaily) => ({
    date: d.date,
    spend: d.total_spend ?? 0,
    revenue: d.gross_amount ?? 0,
  }));

  let territories: FtTerritory[] = [];
  if (latest) {
    const { data: terrRaw } = await sb
      .from("ft_summary_territory")
      .select(TERR_COLS)
      .eq("date", latest.date)
      .order("total_spend", { ascending: false });
    territories = ((terrRaw ?? []) as Record<string, unknown>[]).map((row) => {
      return {
        date: String(row.date),
        territory: String(row.territory),
        total_leads: n(row.total_leads),
        total_spend: n(row.total_spend),
        cost_per_lead: n(row.cost_per_lead),
        self_book_count: n(row.self_book_count),
        demos: n(row.demos),
        gross_amount: n(row.gross_amount),
      };
    });
  }

  return { latest, trend, territories };
}
