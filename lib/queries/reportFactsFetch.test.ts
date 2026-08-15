import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `fetchReportFactRows` must return ALL current fact rows, or say it did not.
 *
 * ══ THE DEFECT (2026-08-15) ══
 *
 * It was a single `.limit(5000)` with no `order`. PostgREST enforces its own
 * `db-max-rows` ceiling and a client `.limit()` cannot raise it — past the cap
 * the response is just short, with no error and no flag. The comment above the
 * call reasoned about "1,844 current rows of 5,000" of headroom, but that
 * measured the TABLE, not what the request returned.
 *
 * With no `order`, the rows that came back were whatever the scan produced —
 * roughly heap order, so the NEWEST facts were the ones dropped. At 2,188
 * current rows the January–July month facts survived and August's did not,
 * which rendered as:
 *
 *   • "Report 137 has not landed for this period" while 137 held 54 sales /
 *     $1,283,027 for Fort Myers;
 *   • a Leads ACTUAL of "—" beside a Leads TARGET of 5,934 — the target computed
 *     from month rows that survived, the actual from MTD rows that did not.
 *
 * Every figure existed in the warehouse. Nothing errored and nothing logged.
 *
 * Source-scanned because the property under test is how the QUERY is built, and
 * there is no Supabase harness in this repo.
 */

const FILE = join(process.cwd(), "lib/queries/reportFacts.ts");
const src = readFileSync(FILE, "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("fetchReportFactRows — cannot be silently truncated", () => {
  it("PAGES with .range rather than trusting one .limit", () => {
    expect(code).toMatch(/\.range\(from, from \+ PAGE - 1\)/);
  });

  it("does NOT rely on a bare .limit to fetch the whole table", () => {
    // The exact shape of the bug. A `.limit(N)` here reads as a capacity
    // decision and is actually a request the server may quietly ignore.
    expect(code).not.toMatch(/\.limit\(5000\)/);
  });

  it("orders on a UNIQUE column, so paging cannot repeat or skip a row", () => {
    // Without a total order PostgREST pages over an unordered scan: a row can
    // land in two pages or none. That is the same defect, quieter.
    expect(code).toMatch(/\.order\("fact_id", \{ ascending: true \}\)/);
  });

  it("stops ONLY on a short page — the one condition that means 'exhausted'", () => {
    expect(code).toMatch(/if \(rows\.length < PAGE\) return out;/);
  });

  it("is LOUD when it gives up early instead of returning a short set quietly", () => {
    // The original failure was silent under-reporting. If this ever stops early
    // it must say so, because the page will render confident wrong numbers.
    expect(code).toMatch(/console\.error\(/);
    expect(code).toMatch(/UNDER-REPORTED/);
  });

  it("keeps the fetch-failure path returning [] rather than throwing", () => {
    // Unchanged contract: a failed fetch renders "not yet sourced", never $0.
    expect(code).toMatch(/catch \(err\)/);
    expect(code).toMatch(/return \[\];/);
  });
});
