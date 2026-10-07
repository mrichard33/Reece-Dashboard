import { lpService } from "@/lib/supabase/lp";
import type { LlmUsageDailyRaw } from "@/lib/supabase/types";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import { addDays, buildDailyTrend, type UsageDay } from "@/lib/queries/llmUsage.core";

/**
 * AI usage for the overview widget — reads LP-MCP's `v_llm_usage_daily`
 * (sql/151, one row per day_et × fn × provider × model). Tokens are always
 * present; cost_usd is NULL for any model without a rate in LP-MCP's
 * LLM_PRICE_TABLE_JSON, and we surface that as `unpricedCalls` rather than
 * showing $0.
 */

const BUSINESS_TZ = "America/New_York";
/** The daily cost chart's reach. The tiles and table stay on today / 7 days. */
const TREND_DAYS = 30;

function etYmd(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function nOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export type UsageBucket = {
  calls: number;
  errors: number;
  tokens: number;
  costUsd: number | null; // null when NO call in the bucket was priced
  unpricedCalls: number;
  /** Sum of avg_latency_ms × calls and the calls it covers; read with `avgLatencyMs`. */
  latencyMsWeighted: number;
  latencyCalls: number;
};

/** Call-weighted mean time per model call in the bucket; null with no timed calls. */
export function avgLatencyMs(b: UsageBucket): number | null {
  return b.latencyCalls > 0 ? b.latencyMsWeighted / b.latencyCalls : null;
}

export type UsageByFn = UsageBucket & { fn: string; model: string };

export type LlmUsageSummary = {
  today: UsageBucket;
  last7d: UsageBucket;
  byFnToday: UsageByFn[];
  /** Calls and cost per ET day, from the first recorded day, up to 30 days. */
  trend: UsageDay[];
  lastCallAt: string | null;
  /** Last call more than 2h ago. Worked out here: render must not read the clock. */
  lastCallStale: boolean;
  available: boolean; // false when the view is missing (LP-MCP sql/151 not applied)
};

function emptyBucket(): UsageBucket {
  return { calls: 0, errors: 0, tokens: 0, costUsd: null, unpricedCalls: 0, latencyMsWeighted: 0, latencyCalls: 0 };
}

function add(b: UsageBucket, r: LlmUsageDailyRaw) {
  b.calls += n(r.calls);
  b.errors += n(r.errors);
  b.tokens += n(r.input_tokens) + n(r.output_tokens) + n(r.cache_read_tokens) + n(r.cache_write_tokens);
  b.unpricedCalls += n(r.unpriced_calls);
  const c = nOrNull(r.cost_usd);
  if (c !== null) b.costUsd = (b.costUsd ?? 0) + c;
  const lat = nOrNull(r.avg_latency_ms);
  const calls = n(r.calls);
  if (lat !== null && calls > 0) {
    b.latencyMsWeighted += lat * calls;
    b.latencyCalls += calls;
  }
}

export async function getLlmUsageSummary(): Promise<LlmUsageSummary> {
  const unavailable = { today: emptyBucket(), last7d: emptyBucket(), byFnToday: [], trend: [], lastCallAt: null, lastCallStale: false, available: false };
  try {
    const sb = lpService();
    const today = etYmd(new Date());
    const since7 = addDays(today, -6);
    const sinceTrend = addDays(today, -(TREND_DAYS - 1));

    // 30 days × function × model can pass PostgREST's 1,000-row cap, which
    // truncates with no error — page, ordered on the view's unique GROUP BY
    // keys (fetchAllPages rules 1 and 2). A failed read throws, and the catch
    // below renders the placeholder: most likely sql/151 is not applied on LP
    // Supabase. Never throw the whole overview.
    const rows = await fetchAllPages<LlmUsageDailyRaw>("llmUsage", (from, to) =>
      sb
        .from("v_llm_usage_daily")
        .select("day_et,fn,provider,model,calls,errors,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,unpriced_calls,avg_latency_ms")
        .gte("day_et", sinceTrend)
        .order("day_et", { ascending: true })
        .order("fn", { ascending: true })
        .order("provider", { ascending: true })
        .order("model", { ascending: true })
        .range(from, to),
    );

    const t = emptyBucket();
    const w = emptyBucket();
    const byFn = new Map<string, UsageByFn>();

    for (const r of rows) {
      if (r.day_et < since7) continue;
      add(w, r);
      if (r.day_et === today) {
        add(t, r);
        const key = `${r.fn}|${r.model}`;
        const cur = byFn.get(key) ?? { ...emptyBucket(), fn: r.fn, model: r.model };
        add(cur, r);
        byFn.set(key, cur);
      }
    }

    const byFnToday = [...byFn.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 8);
    const trend = buildDailyTrend(
      rows.map((r) => ({ day: String(r.day_et).slice(0, 10), calls: n(r.calls), cost: nOrNull(r.cost_usd) })),
      today,
    );

    let lastCallAt: string | null = null;
    try {
      const { data: last } = await sb
        .from("llm_usage_log")
        .select("called_at")
        .order("called_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ called_at: string }>();
      lastCallAt = last?.called_at ?? null;
    } catch {
      lastCallAt = null;
    }

    const lastCallStale = lastCallAt ? Date.now() - new Date(lastCallAt).getTime() > 2 * 60 * 60 * 1000 : false;
    return { today: t, last7d: w, byFnToday, trend, lastCallAt, lastCallStale, available: true };
  } catch {
    return unavailable;
  }
}
