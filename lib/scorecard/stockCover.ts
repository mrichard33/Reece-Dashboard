/**
 * Choosing which snapshots a STOCK figure may be summed over.
 *
 * ── THE DEFECT THIS EXISTS TO PREVENT ───────────────────────────────────────
 *
 * Several snapshots of one report type are current at the same time. For
 * `job_status_ytd` on 2026-08-15 that is nine of them: a YTD roll-up
 * (2026-01-01 → 08-05), seven month tiles (Jan → Jul), and an MTD file
 * (08-01 → 08-14). Report 133 is a CONTRACT-DATE cohort, so a job appears in
 * every snapshot whose window contains its contract date — the YTD roll-up
 * restates every month tile.
 *
 * The flow readers already knew this: `pickSnapshot` in reportFacts.core.ts
 * says "two current snapshots are two reports, not two halves of one". The
 * stock readers did not. They summed every current row on the reasoning that
 * backlog is a point-in-time stock and therefore takes no period filter — true
 * of the *question*, false of the *rows*. Live on 2026-08-15 that showed
 * company open backlog as 510 jobs / $12,312,052 against a real 268 /
 * $6,165,115: the YTD roll-up (242 / $6,146,937) added on top of the tiles it
 * summarises. Jacksonville's HOA line read 11 jobs / $206,064, which was the
 * same five July holds counted twice plus one August hold.
 *
 * ── WHY NOT JUST PICK ONE SNAPSHOT, LIKE THE FLOW READERS DO ────────────────
 *
 * Because no single snapshot answers the question. The YTD roll-up stops at
 * 08-05 and would drop every job contracted in the last nine days — precisely
 * the ones a manager is asking about. The MTD file covers only August. The
 * stock is only complete if disjoint windows are TILED.
 *
 * So the rule is not "one snapshot", it is "a non-overlapping set". This picks
 * the set covering the most calendar time, because coverage is the thing that
 * makes a stock complete; ties go to the set whose stalest member is freshest.
 * It assumes nothing about scope names, so a re-ingest that duplicates a window
 * or an ad-hoc `custom` pull cannot reintroduce the double count.
 */

/** The window identity of a snapshot. Any row shape carrying these qualifies. */
export type SnapshotWindow = {
  period_start: string;
  period_end: string;
  as_of_date: string;
};

/** YYYY-MM-DD → whole days since epoch. Date-only, so no timezone can shift it. */
const dayOf = (ymd: string): number =>
  Math.round(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) /
      86_400_000,
  );

/** Inclusive length of a window in days. A single-day window spans 1, not 0. */
const spanOf = (w: SnapshotWindow): number => dayOf(w.period_end) - dayOf(w.period_start) + 1;

type Cover<T> = {
  /** Calendar days covered. The thing being maximised. */
  days: number;
  /** Oldest as-of in the set — how stale the WORST part of the answer is. */
  oldest: number;
  picked: T[];
};

/**
 * Better of two covers: more days wins; then the one whose stalest member is
 * freshest; then the one built from fewer snapshots, so an exact tie resolves
 * to the simpler answer rather than to input order.
 */
function better<T>(a: Cover<T>, b: Cover<T>): Cover<T> {
  if (a.days !== b.days) return a.days > b.days ? a : b;
  if (a.oldest !== b.oldest) return a.oldest > b.oldest ? a : b;
  return a.picked.length <= b.picked.length ? a : b;
}

/**
 * The non-overlapping subset of `windows` covering the most calendar time.
 *
 * Weighted interval scheduling: sort by window end, then for each window take
 * the better of (skip it) and (take it, plus the best cover ending before it
 * starts). Exact, not greedy — greedy on freshness would drop a wide roll-up
 * for one fresh tile and silently lose the months the tile does not cover.
 *
 * Windows are treated as inclusive of both endpoints, so 01-01→01-31 and
 * 02-01→02-28 do not overlap, while 01-01→08-05 and 08-01→08-14 do.
 */
export function pickStockCover<T extends SnapshotWindow>(windows: readonly T[]): T[] {
  if (windows.length <= 1) return [...windows];
  const items = [...windows].sort(
    (a, b) => dayOf(a.period_end) - dayOf(b.period_end) || dayOf(a.period_start) - dayOf(b.period_start),
  );
  // best[i] = the optimal cover using only items[0 .. i-1].
  const best: Cover<T>[] = [{ days: 0, oldest: Infinity, picked: [] }];
  for (let i = 0; i < items.length; i++) {
    const w = items[i]!;
    const start = dayOf(w.period_start);
    // Largest p such that every item before p ends before w starts. Ends are
    // sorted ascending, so scanning down, the first hit is the largest.
    let p = 0;
    for (let j = i; j >= 1; j--) {
      if (dayOf(items[j - 1]!.period_end) < start) {
        p = j;
        break;
      }
    }
    const prior = best[p]!;
    best[i + 1] = better(
      {
        days: prior.days + spanOf(w),
        oldest: Math.min(prior.oldest, dayOf(w.as_of_date)),
        picked: [...prior.picked, w],
      },
      best[i]!,
    );
  }
  return best[items.length]!.picked;
}

/**
 * Identity of the snapshot a fact row came from. Facts do not carry
 * snapshot_id; (window, as-of) separates any two simultaneously current
 * snapshots of one report type.
 */
export const stockSnapshotKey = (w: SnapshotWindow): string =>
  `${w.period_start}|${w.period_end}|${w.as_of_date}`;

/**
 * Keep only the rows belonging to a maximal non-overlapping cover.
 *
 * The cover is chosen from EVERY row of the report type, before any market
 * filter, so that every market is answered from the same set of snapshots. A
 * market with no HOA holds in July must contribute zero for July, not shift the
 * cover — otherwise two offices would be summed over different windows and the
 * company total would not be the sum of its offices.
 */
export function keepStockCover<T extends SnapshotWindow>(rows: readonly T[]): T[] {
  if (!rows.length) return [];
  const byKey = new Map<string, T>();
  for (const r of rows) if (!byKey.has(stockSnapshotKey(r))) byKey.set(stockSnapshotKey(r), r);
  const keep = new Set(pickStockCover([...byKey.values()]).map(stockSnapshotKey));
  return rows.filter((r) => keep.has(stockSnapshotKey(r)));
}
