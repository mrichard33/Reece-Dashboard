/**
 * Read every row of a query, or say loudly that you did not.
 *
 * ══ WHY THIS EXISTS ══
 *
 * `.limit(N)` on a Supabase query is a REQUEST, not a guarantee. PostgREST
 * enforces its own `db-max-rows` ceiling and a client limit cannot raise it:
 * past the cap the response is simply short, with **no error and no truncation
 * flag**. A caller that reads `data.length` sees a plausible number and reports
 * it as the whole table.
 *
 * That failed silently in production on 2026-08-15. `fetchReportFactRows` asked
 * for 5,000 rows of a 2,188-row set and got fewer, with no `order`, so WHICH
 * rows came back was whatever the scan produced — roughly heap order, meaning
 * the NEWEST facts were dropped. The scorecard rendered "Report 137 has not
 * landed for this period" while report 137 held 54 sales and $1,283,027 for
 * Fort Myers, and showed a Leads target of 5,934 with an actual of "—" because
 * the target's rows survived and the actual's did not. Two renders five minutes
 * apart disagreed, because the truncation was not deterministic either.
 *
 * ══ THE TWO RULES ══
 *
 *  1. PAGE until a SHORT page proves the set is exhausted. That is the only
 *     condition that means "we have everything". A full page never does.
 *  2. Order on a UNIQUE column. Paging an unordered — or non-uniquely ordered —
 *     scan lets a row land in two pages or in none, which is the same defect
 *     one level quieter and considerably harder to see.
 *
 * Stopping early is LOUD. The original bug survived four rounds of fixes
 * precisely because it never said anything.
 */

/** PostgREST's common `db-max-rows`. Pages at or below any realistic ceiling. */
export const PAGE_SIZE = 1000;

/** Runaway guard, not a capacity limit. 50 pages = 50,000 rows. */
const MAX_PAGES = 50;

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * @param label   Prefix for the truncation log — name the call site, not the table.
 * @param page    Runs ONE page. Must apply `.range(from, to)` AND an order on a
 *                unique column; this helper cannot enforce either for you.
 */
export async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const from = p * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    // The ONLY exit that means "complete".
    if (rows.length < PAGE_SIZE) return out;
  }
  console.error(
    `[${label}] page cap hit — read ${out.length} rows and stopped. Figures on this ` +
      `render are UNDER-REPORTED. Raise MAX_PAGES in lib/queries/fetchAllPages.ts.`,
  );
  return out;
}
