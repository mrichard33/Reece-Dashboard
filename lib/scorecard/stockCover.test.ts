import { describe, expect, it } from "vitest";
import { keepStockCover, pickStockCover } from "./stockCover";

const w = (period_start: string, period_end: string, as_of_date: string) => ({
  period_start,
  period_end,
  as_of_date,
});

/**
 * The live 2026-08-15 shape of report 133: a YTD roll-up, seven month tiles,
 * and an MTD file. Nine current snapshots, and the roll-up restates the tiles.
 */
const YTD = w("2026-01-01", "2026-08-05", "2026-08-05");
const MONTHS = [
  w("2026-01-01", "2026-01-31", "2026-08-10"),
  w("2026-02-01", "2026-02-28", "2026-08-10"),
  w("2026-03-01", "2026-03-31", "2026-08-10"),
  w("2026-04-01", "2026-04-30", "2026-08-10"),
  w("2026-05-01", "2026-05-31", "2026-08-10"),
  w("2026-06-01", "2026-06-30", "2026-08-10"),
  w("2026-07-01", "2026-07-31", "2026-08-10"),
];
const MTD = w("2026-08-01", "2026-08-14", "2026-08-15");

const starts = (rows: readonly { period_start: string }[]) =>
  rows.map((r) => r.period_start).sort();

describe("pickStockCover", () => {
  it("drops the YTD roll-up that restates the month tiles", () => {
    const picked = pickStockCover([YTD, ...MONTHS, MTD]);
    expect(picked).not.toContainEqual(YTD);
    expect(starts(picked)).toEqual(starts([...MONTHS, MTD]));
  });

  it("never returns two windows that overlap", () => {
    const picked = pickStockCover([YTD, ...MONTHS, MTD]);
    const byStart = [...picked].sort((a, b) => a.period_start.localeCompare(b.period_start));
    for (let i = 1; i < byStart.length; i++) {
      expect(byStart[i]!.period_start > byStart[i - 1]!.period_end).toBe(true);
    }
  });

  it("adjacent windows are not overlapping — Jan 31 and Feb 1 both survive", () => {
    const picked = pickStockCover([MONTHS[0]!, MONTHS[1]!]);
    expect(picked).toHaveLength(2);
  });

  it("keeps the roll-up when the tiles cover less calendar time", () => {
    // Only July survived as a tile. Greedy-on-freshness would take July (08-10)
    // and then reject the YTD roll-up, silently losing Jan–Jun.
    const picked = pickStockCover([YTD, MONTHS[6]!]);
    expect(picked).toEqual([YTD]);
  });

  it("prefers the tiling when it reaches further than the roll-up", () => {
    // Months + MTD reach 08-14 (226 days) against the roll-up's 08-05 (217).
    const picked = pickStockCover([YTD, ...MONTHS, MTD]);
    const days = picked.reduce(
      (n, p) =>
        n +
        (Date.parse(`${p.period_end}T00:00:00Z`) - Date.parse(`${p.period_start}T00:00:00Z`)) /
          86_400_000 +
        1,
      0,
    );
    expect(days).toBe(226);
  });

  it("breaks a coverage tie on the freshest stalest member", () => {
    const stale = w("2026-03-01", "2026-03-31", "2026-07-01");
    const fresh = w("2026-03-01", "2026-03-31", "2026-08-10");
    expect(pickStockCover([stale, fresh])).toEqual([fresh]);
    expect(pickStockCover([fresh, stale])).toEqual([fresh]);
  });

  it("is order-independent", () => {
    const a = pickStockCover([YTD, ...MONTHS, MTD]);
    const b = pickStockCover([MTD, ...[...MONTHS].reverse(), YTD]);
    expect(starts(a)).toEqual(starts(b));
  });

  it("handles the trivial inputs", () => {
    expect(pickStockCover([])).toEqual([]);
    expect(pickStockCover([YTD])).toEqual([YTD]);
  });

  it("a re-ingest duplicating one window cannot double-count it", () => {
    const again = w("2026-07-01", "2026-07-31", "2026-08-14");
    const picked = pickStockCover([...MONTHS, again]);
    expect(picked.filter((p) => p.period_start === "2026-07-01")).toEqual([again]);
  });
});

describe("keepStockCover", () => {
  /**
   * Jacksonville's live 2026-08-15 HOA rows, which rendered as 11 jobs /
   * $206,064 — the same five July holds counted twice plus one August hold.
   *
   * The other month tiles carry no JAX HOA rows, so they appear here as the
   * rows they DO carry. That is the real shape: the cover is chosen across
   * every report-133 row, and a tile with no HOA holds still anchors its
   * window. Reducing this fixture to HOA rows alone would leave the roll-up
   * covering more calendar time than the tiles, and it would rightly win.
   */
  const ROWS = [
    { ...YTD, market: "JAX_MKT", bucket: "hoa", value_count: 5, value_cents: 8_463_200 },
    { ...MONTHS[6]!, market: "JAX_MKT", bucket: "hoa", value_count: 5, value_cents: 8_463_200 },
    { ...MTD, market: "JAX_MKT", bucket: "hoa", value_count: 1, value_cents: 3_680_000 },
    ...MONTHS.slice(0, 6).map((m) => ({
      ...m,
      market: "JAX_MKT",
      bucket: "other_pending",
      value_count: 0,
      value_cents: 0,
    })),
  ];

  const hoa = (rows: readonly (typeof ROWS)[number][]) => rows.filter((r) => r.bucket === "hoa");

  it("counts the same five July holds once, not twice", () => {
    const kept = hoa(keepStockCover(ROWS));
    expect(kept.reduce((n, r) => n + r.value_count, 0)).toBe(6);
    expect(kept.reduce((n, r) => n + r.value_cents, 0)).toBe(12_143_200);
  });

  it("the pre-fix naive sum is what it is guarding against", () => {
    expect(hoa(ROWS).reduce((n, r) => n + r.value_count, 0)).toBe(11);
    expect(hoa(ROWS).reduce((n, r) => n + r.value_cents, 0)).toBe(20_606_400);
  });

  it("keeps every row of a selected snapshot, across markets and buckets", () => {
    const rows = [
      { ...MTD, market: "JAX_MKT", bucket: "hoa", value_count: 1 },
      { ...MTD, market: "ORL_MKT", bucket: "hoa", value_count: 2 },
      { ...MTD, market: "ORL_MKT", bucket: "other_pending", value_count: 3 },
      { ...YTD, market: "ORL_MKT", bucket: "hoa", value_count: 9 },
    ];
    // MTD (14 days) beats the roll-up here only because both are candidates and
    // they overlap; the roll-up is wider, so it wins and MTD is dropped.
    const kept = keepStockCover(rows);
    expect(kept).toEqual([rows[3]]);
  });

  it("chooses the cover from every market's rows, not one market's", () => {
    // JAX has no July HOA holds; ORL does. If the cover were computed per
    // market, JAX would be summed over different windows than ORL and the
    // offices would stop footing to the company.
    const rows = [
      { ...MONTHS[6]!, market: "ORL_MKT", value_count: 4 },
      { ...MTD, market: "ORL_MKT", value_count: 1 },
      { ...MTD, market: "JAX_MKT", value_count: 2 },
    ];
    const kept = keepStockCover(rows);
    expect(kept).toHaveLength(3);
    const jaxWindows = new Set(
      keepStockCover(rows)
        .filter((r) => r.market === "JAX_MKT")
        .map((r) => r.period_start),
    );
    expect(jaxWindows.has("2026-08-01")).toBe(true);
  });

  it("returns [] for no rows rather than inventing a zero", () => {
    expect(keepStockCover([])).toEqual([]);
  });
});
