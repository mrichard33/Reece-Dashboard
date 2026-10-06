import { describe, it, expect } from "vitest";
import { fetchReviewCounts, fetchReviewCountsFallback, type CountsClient } from "./botReviewCounts";

type Row = { review_count: number; review_lane: string; dismissed: boolean; generated_at: string };

const SINCE = "2026-09-29T00:00:00.000Z";
const ROWS: Row[] = [
  { review_count: 0, review_lane: "must_review", dismissed: false, generated_at: "2026-10-05T10:00:00Z" },
  { review_count: 0, review_lane: "must_review", dismissed: true, generated_at: "2026-10-05T11:00:00Z" },
  { review_count: 2, review_lane: "must_review", dismissed: false, generated_at: "2026-10-04T10:00:00Z" },
  { review_count: 0, review_lane: "spot_check", dismissed: false, generated_at: "2026-09-20T10:00:00Z" },
  { review_count: 1, review_lane: "spot_check", dismissed: false, generated_at: "2026-10-01T10:00:00Z" },
  { review_count: 0, review_lane: "none", dismissed: false, generated_at: "2026-10-06T09:00:00Z" },
];

/**
 * A fake Supabase client over ROWS. Counts apply the same filters PostgREST
 * would; the RPC applies the WHERE clauses written in LP MCP sql/146. Every
 * call is recorded so the test can say how many reads a render made.
 */
function fakeClient(opts: { rpc: "ok" | "missing"; viewMissing?: boolean; cutover?: string | null }) {
  const calls: string[] = [];
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push(`rpc:${fn}`);
      if (opts.rpc === "missing") {
        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
      }
      const since = String(args.p_since);
      const c = (f: (r: Row) => boolean) => ROWS.filter(f).length;
      return Promise.resolve({
        data: {
          to_review: c((r) => r.review_count === 0),
          week_total: c((r) => r.generated_at >= since),
          week_reviewed: c((r) => r.generated_at >= since && r.review_count > 0),
          must_review: c((r) => r.review_lane === "must_review" && r.dismissed === false && r.review_count === 0),
          spot_check: c((r) => r.review_lane === "spot_check" && r.dismissed === false && r.review_count === 0),
          everything: ROWS.length,
          thread_cutover_at: opts.cutover ?? null,
        },
        error: null,
      });
    },
    from(table: string) {
      calls.push(`from:${table}`);
      return {
        select() {
          const filters: Array<(r: Row) => boolean> = [];
          let single = false;
          let key: string | null = null;
          const q = {
            eq(col: string, v: unknown) {
              if (col === "key") key = String(v);
              else filters.push((r) => String((r as Record<string, unknown>)[col]) === String(v));
              return q;
            },
            is(col: string, v: unknown) {
              filters.push((r) => (r as Record<string, unknown>)[col] === v);
              return q;
            },
            gte(col: string, v: unknown) {
              filters.push((r) => String((r as Record<string, unknown>)[col]) >= String(v));
              return q;
            },
            gt(col: string, v: unknown) {
              filters.push((r) => Number((r as Record<string, unknown>)[col]) > Number(v));
              return q;
            },
            maybeSingle() {
              single = true;
              return q;
            },
            then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
              let res: unknown;
              if (table === "bot_settings") {
                res = { data: single && key && opts.cutover ? { value: opts.cutover } : null, error: null };
              } else if (opts.viewMissing) {
                res = { count: null, error: { code: "42P01", message: 'relation "v_bot_review_queue" does not exist' } };
              } else {
                res = { count: ROWS.filter((r) => filters.every((f) => f(r))).length, error: null };
              }
              return Promise.resolve(res).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },
  } as unknown as CountsClient;
  return { client, calls };
}

describe("fetchReviewCounts", () => {
  it("returns the same six numbers as the old six queries", async () => {
    const one = await fetchReviewCounts(fakeClient({ rpc: "ok" }).client, SINCE);
    const six = await fetchReviewCountsFallback(fakeClient({ rpc: "ok" }).client, SINCE);
    const pick = (c: typeof one) => [c.toReview, c.weekTotal, c.weekReviewed, c.mustReview, c.spotCheck, c.everything];
    expect(pick(one)).toEqual(pick(six));
    expect(pick(one)).toEqual([4, 5, 2, 1, 1, 6]);
    expect(one.source).toBe("rpc");
  });

  it("is one read when sql/146 is applied", async () => {
    const { client, calls } = fakeClient({ rpc: "ok", cutover: "2026-09-11T19:00:00Z" });
    const c = await fetchReviewCounts(client, SINCE);
    expect(calls).toEqual(["rpc:bot_review_counts"]);
    expect(c.cutoverAt).toBe("2026-09-11T19:00:00Z");
  });

  it("falls back to the old queries, and still reads the cutover, before sql/146 is applied", async () => {
    const { client, calls } = fakeClient({ rpc: "missing", cutover: "2026-09-11T19:00:00Z" });
    const c = await fetchReviewCounts(client, SINCE);
    expect(c.source).toBe("fallback");
    expect(c.mustReview).toBe(1);
    expect(c.cutoverAt).toBe("2026-09-11T19:00:00Z");
    expect(calls.filter((x) => x === "from:v_bot_review_queue")).toHaveLength(6);
  });

  it("says which migration is missing instead of reading as zero work", async () => {
    const c = await fetchReviewCounts(fakeClient({ rpc: "missing", viewMissing: true }).client, SINCE);
    expect(c.needsMigration).toBe(true);
    expect(c.cutoverAt).toBeNull();
  });
});
