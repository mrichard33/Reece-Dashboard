import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchAllPages, PAGE_SIZE } from "./fetchAllPages";

/**
 * The helper that ended the silent-truncation bug class.
 *
 * Unit-testable because the page fetch is injected — the property under test is
 * the LOOP, not Supabase. See fetchAllPages.ts for what the original failure
 * looked like in production.
 */

/** A fake table of n rows, served in PAGE_SIZE windows. */
const table = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  return {
    rows,
    page: vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    })),
  };
};

afterEach(() => vi.restoreAllMocks());

describe("fetchAllPages", () => {
  it("returns every row when the set spans several pages", async () => {
    const t = table(2_347); // the real lp_report_facts count on 2026-08-15
    const out = await fetchAllPages<{ id: number }>("test", t.page);
    expect(out).toHaveLength(2_347);
    // Complete AND in order — a paging bug usually shows up as a gap, not a count.
    expect(out.map((r) => r.id)).toEqual(t.rows.map((r) => r.id));
    expect(t.page).toHaveBeenCalledTimes(3);
  });

  it("stops only on a SHORT page — a full page never means 'done'", async () => {
    // Exactly PAGE_SIZE rows: the first page is full, so the loop MUST ask again
    // and only then see the empty page. Treating a full page as the end is the
    // off-by-one that would reintroduce truncation at exact multiples.
    const t = table(PAGE_SIZE);
    const out = await fetchAllPages<{ id: number }>("test", t.page);
    expect(out).toHaveLength(PAGE_SIZE);
    expect(t.page).toHaveBeenCalledTimes(2);
  });

  it("handles an empty set in one request", async () => {
    const t = table(0);
    expect(await fetchAllPages("test", t.page)).toEqual([]);
    expect(t.page).toHaveBeenCalledTimes(1);
  });

  it("requests correctly-sized, non-overlapping windows", async () => {
    const t = table(1_500);
    await fetchAllPages("test", t.page);
    expect(t.page.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    ]);
  });

  it("throws on a query error rather than returning a partial set", async () => {
    // A caller's catch turns this into "not yet sourced". Silently returning the
    // pages that happened to succeed is the failure this whole module exists to
    // prevent.
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(fetchAllPages("test", page)).rejects.toThrow("boom");
  });

  it("treats a null data page as the end, not as a crash", async () => {
    const page = vi.fn(async () => ({ data: null, error: null }));
    expect(await fetchAllPages("test", page)).toEqual([]);
  });

  it("is LOUD when it hits the page cap, and still returns what it has", async () => {
    // The defining property. The original bug survived four rounds of fixes
    // because under-reporting looked identical to a small table.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = table(PAGE_SIZE * 60); // beyond MAX_PAGES
    const out = await fetchAllPages<{ id: number }>("noisy", t.page);
    expect(out).toHaveLength(PAGE_SIZE * 50);
    expect(spy).toHaveBeenCalledTimes(1);
    const msg = String(spy.mock.calls[0]?.[0] ?? "");
    expect(msg).toContain("[noisy]");
    expect(msg).toContain("UNDER-REPORTED");
  });

  it("says nothing when the read is complete", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await fetchAllPages("quiet", table(10).page);
    expect(spy).not.toHaveBeenCalled();
  });
});
