import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NO query may read a large table with a bare `.limit()`.
 *
 * ══ THE DEFECT (2026-08-15) ══
 *
 * `.limit(N)` is a request, not a guarantee — PostgREST caps it at its own
 * `db-max-rows` and returns a SHORT response with no error and no flag. Four
 * call sites assumed otherwise:
 *
 *   fetchReportFactRows   lp_report_facts        2,188 rows, limit 5000, no order
 *   tiers/fetchFacts      lp_report_facts        2,347 rows, limit 5000, no order
 *   tiers/fetchJobDates   scorecard_report_rows_a 6,181 rows, limit 5000  ← short
 *                                                 by 1,181 on its OWN limit
 *   tiers/fetchSourceNsli lp_source_scorecard_daily 1,860 rows, non-unique order
 *
 * The first one rendered "Report 137 has not landed for this period" while 137
 * held 54 sales / $1,283,027, and a Leads target of 5,934 beside an actual of
 * "—". Two renders five minutes apart disagreed, because with no `order` the
 * truncation was not even deterministic.
 *
 * Source-scanned because the property under test is how the QUERY is built, and
 * there is no Supabase harness in this repo. The LOOP itself is unit-tested in
 * fetchAllPages.test.ts.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SITES = [
  { file: "lib/queries/reportFacts.ts", label: "reportFacts", order: "fact_id" },
  { file: "lib/queries/tiers.ts", label: "tiers", order: "fact_id" },
] as const;

describe("large-table reads page instead of guessing a limit", () => {
  for (const site of SITES) {
    const code = strip(read(site.file));

    it(`${site.file} routes big reads through fetchAllPages`, () => {
      expect(code).toMatch(/fetchAllPages/);
    });

    it(`${site.file} has no bare .limit(5000) left`, () => {
      // The exact shape of the bug: a number large enough to look generous and
      // small enough to be wrong, on a request the server may ignore anyway.
      expect(code).not.toMatch(/\.limit\(5000\)/);
    });

    it(`${site.file} pages with .range`, () => {
      expect(code).toMatch(/\.range\(from, to\)/);
    });
  }

  it("every paged read orders on a UNIQUE column", () => {
    // Paging a non-uniquely-ordered scan lets a row appear twice or never.
    // fetchSourceNsli previously ordered on as_of_date alone, which many rows
    // share; `id` is the tiebreaker.
    const tiers = strip(read("lib/queries/tiers.ts"));
    expect(tiers).toMatch(/\.order\("fact_id", \{ ascending: true \}\)/);
    expect(tiers).toMatch(/\.order\("id", \{ ascending: true \}\)/);
    const facts = strip(read("lib/queries/reportFacts.ts"));
    expect(facts).toMatch(/\.order\("fact_id", \{ ascending: true \}\)/);
  });

  it("the fetch-failure contract is unchanged — [], never a throw to the page", () => {
    // A failed fetch must still render "not yet sourced", never $0.
    for (const site of SITES) {
      const code = strip(read(site.file));
      expect(code).toMatch(/catch \(err\)/);
      expect(code).toMatch(/return \[\];/);
    }
  });
});
