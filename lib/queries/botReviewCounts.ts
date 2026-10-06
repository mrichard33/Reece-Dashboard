/**
 * Bot Review — the page's six counts in one read.
 *
 * 2026-10-06: getHeaderCounts and getLaneCounts each ran three count queries
 * on v_bot_review_queue, so every click on the Review tab paid six round trips
 * for six numbers. LP MCP sql/146 adds bot_review_counts(p_since), which scans
 * the view once with the same conditions and also returns the
 * review_thread_cutover_at setting.
 *
 * The client is passed in (not imported) so the equivalence with the old six
 * queries is tested without a database. When the function is missing (sql/146
 * not applied yet) or errors, this falls back to the old six queries, so the
 * page never depends on the migration order.
 */

export type ReviewCounts = {
  toReview: number;
  weekTotal: number;
  weekReviewed: number;
  mustReview: number;
  spotCheck: number;
  everything: number;
  /** The view itself is missing (sql/103/104 not applied). */
  needsMigration: boolean;
  /** bot_settings.review_thread_cutover_at, or null when unset. */
  cutoverAt: string | null;
  source: "rpc" | "fallback";
};

type Res = {
  count?: number | null;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};
/** A PostgREST builder, as far as these reads use one. */
type Query = PromiseLike<Res> & {
  eq(col: string, v: unknown): Query;
  is(col: string, v: unknown): Query;
  gte(col: string, v: unknown): Query;
  gt(col: string, v: unknown): Query;
  maybeSingle(): Query;
};

/** The slice of the Supabase client this needs. */
export type CountsClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  from(table: string): { select(cols: string, opts?: { count?: "exact"; head?: boolean }): Query };
};

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v ?? 0) || 0);

function settingText(value: unknown): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : String(value);
  return s.trim() === "" ? null : s;
}

export async function fetchReviewCounts(svc: CountsClient, sinceIso: string): Promise<ReviewCounts> {
  const { data, error } = await svc.rpc("bot_review_counts", { p_since: sinceIso });
  if (!error && data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    return {
      toReview: n(d.to_review),
      weekTotal: n(d.week_total),
      weekReviewed: n(d.week_reviewed),
      mustReview: n(d.must_review),
      spotCheck: n(d.spot_check),
      everything: n(d.everything),
      needsMigration: false,
      cutoverAt: settingText(d.thread_cutover_at),
      source: "rpc",
    };
  }
  return fetchReviewCountsFallback(svc, sinceIso);
}

/** The six queries the page used before sql/146, unchanged, plus the setting. */
export async function fetchReviewCountsFallback(svc: CountsClient, sinceIso: string): Promise<ReviewCounts> {
  const count = () => svc.from("v_bot_review_queue").select("context_id", { count: "exact", head: true });
  const open = (lane: string) => count().eq("review_lane", lane).is("dismissed", false).eq("review_count", 0);

  const [unreviewed, weekTotal, weekReviewed, must, spot, all, setting] = await Promise.all([
    count().eq("review_count", 0),
    count().gte("generated_at", sinceIso),
    count().gte("generated_at", sinceIso).gt("review_count", 0),
    open("must_review"),
    open("spot_check"),
    count(),
    svc.from("bot_settings").select("value").eq("key", "review_thread_cutover_at").maybeSingle(),
  ]);

  const needsMigration = Boolean(unreviewed.error && isMissingRelation(unreviewed.error));
  return {
    toReview: unreviewed.count ?? 0,
    weekTotal: weekTotal.count ?? 0,
    weekReviewed: weekReviewed.count ?? 0,
    // A missing sql/106 reads as zero work, never as an error.
    mustReview: must.error ? 0 : (must.count ?? 0),
    spotCheck: spot.error ? 0 : (spot.count ?? 0),
    everything: all.error ? 0 : (all.count ?? 0),
    needsMigration,
    cutoverAt: setting.error ? null : settingText((setting.data as { value?: unknown } | null)?.value),
    source: "fallback",
  };
}
