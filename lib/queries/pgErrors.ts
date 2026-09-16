/**
 * Postgres error predicates shared by every page whose data ships in a
 * migration that may not be applied yet.
 *
 * These were written for the Command Center (sql/102, sql/112) and are needed
 * again by /agent (sql/113). They live here rather than in either page's query
 * module so there is exactly one copy: the distinction they draw is subtle
 * enough that a second, slightly different copy is how it gets lost.
 */

export type PgError = { code?: string; message?: string } | null;

/** Postgres says 42P01 for "relation does not exist" — i.e. the migration isn't applied. */
export function isMissingRelation(error: PgError): boolean {
  if (!error) return false;
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "");
}

/**
 * Postgres says 42703 for "column does not exist" — i.e. the table or view is
 * there but it is an OLDER VERSION of it.
 *
 * This is the case a missing-relation check cannot see, and it is the one that
 * actually happened. sql/112 does not CREATE v_command_center_queue, it
 * REPLACES it — so with only sql/112 missing, the view still exists, a filter
 * on the new lanes matches no rows, and PostgREST returns 0 with no error at
 * all. The page then renders a confident "No stale issues" over 624 of them.
 *
 * A zero that means "nothing to do" and a zero that means "the migration is
 * missing" must never look the same on screen.
 */
export function isMissingColumn(error: PgError): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}
