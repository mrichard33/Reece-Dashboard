import { unstable_cache } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { verdictFor } from "@/lib/commandCenter/rules";
import type { QueueCard, Confidence, RuleAction, Lane } from "@/lib/commandCenter/rules";
import { buildGroups, type BatchGroup } from "@/lib/commandCenter/batch";
import { isMissingColumn, isMissingRelation } from "./pgErrors";

/**
 * Command Center reads. Straight from LP Supabase through the service client —
 * the page NEVER writes a memory table from here. Every write goes through
 * lib/actions/commandCenter.ts → LP MCP memory_rule → claude_rule_apply, which
 * is the only thing that can close a card, and the only thing that leaves an
 * audit row.
 *
 * Everything here degrades: if sql/102 has not been applied yet the view and the
 * log do not exist, and each function returns an empty result with
 * `needsMigration` set so the page can say so instead of crashing.
 */

export const PAGE_SIZE = 25;

/**
 * The migration-degradation predicates moved to lib/queries/pgErrors.ts when
 * /agent (sql/113) needed the same guard. Re-exported here so every existing
 * import keeps working and there is still only one implementation.
 */
export { isMissingColumn, isMissingRelation, type PgError } from "./pgErrors";

/** The files a caller may be told to apply, with the sections to run. */
export const MIGRATIONS = {
  r1: { file: "sql/102_command_center.sql", sections: "A through F" },
  r2: { file: "sql/112_command_center_r2.sql", sections: "A through G" },
} as const;

export type MigrationRef = (typeof MIGRATIONS)[keyof typeof MIGRATIONS];

export type QueueFilters = {
  /** Which lane to read. Defaults to rulings, which is what Release 1 asked for. */
  lane?: Lane;
  area?: string | null;
  type?: string | null;
  omiOnly?: boolean;
  highConfidenceOnly?: boolean;
  page?: number;
};

export type QueueResult = {
  cards: QueueCard[];
  total: number;
  page: number;
  pageSize: number;
  areas: string[];
  lane: Lane;
  /** Echoed back so the pager can keep them rather than dropping them. */
  filters: Record<string, string | null>;
  needsMigration: boolean;
  error: string | null;
};

/**
 * The Rulings lane, in the view's own risk-first order: conflicts, then money /
 * live-leads / customer-messaging, then whatever is blocking the most other
 * work, then the area ranking, then oldest first. The ordering lives in the view
 * so chat and this page never disagree about what is next.
 */
export async function getQueue(filters: QueueFilters = {}): Promise<QueueResult> {
  const page = Math.max(1, filters.page ?? 1);
  const lane: Lane = filters.lane ?? "rulings";
  const from = (page - 1) * PAGE_SIZE;
  const applied: Record<string, string | null> = {
    area: filters.area ?? null,
    type: filters.type ?? null,
    omi: filters.omiOnly ? "1" : null,
    high: filters.highConfidenceOnly ? "1" : null,
  };
  const empty: QueueResult = {
    cards: [], total: 0, page, pageSize: PAGE_SIZE, areas: [], lane,
    filters: applied, needsMigration: false, error: null,
  };

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  let q = sb
    .from("v_command_center_queue")
    .select("*", { count: "exact" })
    .eq("lane", lane);

  if (filters.area) q = q.eq("area", filters.area);
  if (filters.type) q = q.eq("card_type", filters.type);
  if (filters.omiOnly) q = q.eq("origin", "omi");
  if (filters.highConfidenceOnly) q = q.eq("rec_confidence", "high");

  const { data, error, count } = await q
    .order("sort_conflict", { ascending: true })
    .order("sort_risk", { ascending: true })
    .order("sort_blocks", { ascending: true })
    .order("area_rank", { ascending: true })
    .order("area", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }

  // The filter dropdown offers only the areas that actually have open cards.
  const areaRes = await sb
    .from("v_command_center_queue")
    .select("area")
    .eq("lane", lane)
    .not("area", "is", null);
  const areas = [...new Set((areaRes.data ?? []).map((r) => r.area as string))].sort();

  return {
    cards: (data ?? []) as QueueCard[],
    total: count ?? 0,
    page, pageSize: PAGE_SIZE, areas, lane, filters: applied,
    needsMigration: false, error: null,
  };
}

export type BatchGroupsResult = {
  groups: BatchGroup[];
  needsMigration: boolean;
  error: string | null;
};

/**
 * The high-confidence cards of one lane, grouped by the reason they share.
 *
 * Reads past the page size on purpose — a group is a group whether or not its
 * members happen to fall on the page someone is looking at. The read is capped
 * well above BATCH_MAX so the count on a group header is honest about how many
 * exist, even when the pass itself can only take 50 of them.
 */
export async function getBatchGroups(lane: Lane): Promise<BatchGroupsResult> {
  const empty: BatchGroupsResult = { groups: [], needsMigration: false, error: null };
  if (lane === "rulings") return empty; // a decision is never a bulk action

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const { data, error } = await sb
    .from("v_command_center_queue")
    .select("*")
    .eq("lane", lane)
    .eq("rec_confidence", "high")
    .order("sort_risk", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }

  return { groups: buildGroups((data ?? []) as QueueCard[], lane), needsMigration: false, error: null };
}

export type HeaderStats = {
  rulingsOpen: number;
  staleIssuesOpen: number;
  todosOpen: number;
  oldestRulingDays: number | null;
  ruledThisWeek: number;
  ruledLastWeek: number;
  needsMigration: boolean;
  /** Which migration to apply, when one is missing. Null when nothing is. */
  migration: MigrationRef | null;
  error: string | null;
};

/** The four tiles across the top. */
export async function getHeader(): Promise<HeaderStats> {
  const empty: HeaderStats = {
    rulingsOpen: 0, staleIssuesOpen: 0, todosOpen: 0, oldestRulingDays: null,
    ruledThisWeek: 0, ruledLastWeek: 0, needsMigration: false, migration: null, error: null,
  };
  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  // This week against last week, so the header shows movement rather than a pile.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  // All six in parallel. They were sequential when there was one lane to count;
  // with three lanes that is six round trips stacked end to end in front of
  // every page load, on the one component every tab renders.
  const [queue, stale, todos, thisWeek, lastWeek, r2] = await Promise.all([
    sb.from("v_command_center_queue")
      .select("age_days", { count: "exact" })
      .eq("lane", "rulings")
      .order("age_days", { ascending: false })
      .limit(1),
    // Counted from the VIEW now rather than from the tables, so the tile and
    // the lane can never disagree: whatever the view shows is what gets counted,
    // including the snooze rule and the 364 rows with no item_type at all.
    sb.from("v_command_center_queue")
      .select("source_id", { count: "exact", head: true })
      .eq("lane", "stale"),
    sb.from("v_command_center_queue")
      .select("source_id", { count: "exact", head: true })
      .eq("lane", "todos"),
    sb.from("claude_rulings_log")
      .select("id", { count: "exact", head: true })
      .gte("at", weekAgo),
    sb.from("claude_rulings_log")
      .select("id", { count: "exact", head: true })
      .gte("at", twoWeeksAgo)
      .lt("at", weekAgo),
    // Is the VIEW the sql/112 version? omi_action_item_id exists only there, so
    // a 42703 is a precise answer to "has R2 been applied", and it costs nothing
    // extra — it runs alongside the counts rather than after them.
    sb.from("v_command_center_queue").select("omi_action_item_id").limit(1),
  ]);

  // sql/102 never applied: the view itself is absent.
  if (queue.error) {
    if (isMissingRelation(queue.error)) {
      return { ...empty, needsMigration: true, migration: MIGRATIONS.r1 };
    }
    return { ...empty, error: queue.error.message };
  }

  // sql/112 not applied: the view is there but it is the R1 version. Nothing
  // above errors in that state — the lane filters just match nothing — so this
  // probe is the only thing standing between the person and two confident
  // zeros where 624 issues and 2,400 to-dos should be.
  if (isMissingColumn(r2.error) || isMissingRelation(stale.error ?? todos.error ?? null)) {
    return {
      ...empty,
      rulingsOpen: queue.count ?? 0,
      oldestRulingDays: queue.data?.[0]?.age_days ?? null,
      ruledThisWeek: thisWeek.count ?? 0,
      ruledLastWeek: lastWeek.count ?? 0,
      needsMigration: true,
      migration: MIGRATIONS.r2,
    };
  }

  return {
    rulingsOpen: queue.count ?? 0,
    staleIssuesOpen: stale.count ?? 0,
    todosOpen: todos.count ?? 0,
    oldestRulingDays: queue.data?.[0]?.age_days ?? null,
    ruledThisWeek: thisWeek.count ?? 0,
    ruledLastWeek: lastWeek.count ?? 0,
    needsMigration: false,
    migration: null,
    error: null,
  };
}

export type DecidedRow = {
  id: number;
  at: string;
  ruled_by: string;
  via: string;
  action: string;
  target_table: string;
  target_id: number;
  reason: string | null;
  reverses_id: number | null;
  reversed_by: number | null;
  decision_id: number | null;
  rec_verdict: string | null;
  /** Joined from claude_decision_log. */
  decision_text: string | null;
  decision_status: string | null;
  rollout_stage: string | null;
  /** How many times this same card has been ruled — the flip count. */
  flip_count: number;
  /** The card's own words, for the row heading. */
  card_title: string | null;
  /** Set on every lane ruling and every batch member (sql/112). */
  batch_id: string | null;
  /** How many cards this batch ruled. 1 means it was a single click. */
  batch_size: number;
  /** True on the one row that stands for the whole batch. */
  is_batch_summary: boolean;
};

export type DecidedResult = {
  rows: DecidedRow[];
  total: number;
  page: number;
  pageSize: number;
  needsMigration: boolean;
  error: string | null;
};

/**
 * The Decided tab: what has been ruled, newest first, with enough context to
 * flip one back — the decision it wrote, its rollout stage, and whether it has
 * already been reversed.
 */
export async function getDecided({ page = 1 }: { page?: number } = {}): Promise<DecidedResult> {
  const p = Math.max(1, page);
  const from = (p - 1) * PAGE_SIZE;
  const empty: DecidedResult = { rows: [], total: 0, page: p, pageSize: PAGE_SIZE, needsMigration: false, error: null };

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const { data, error, count } = await sb
    .from("claude_rulings_log")
    .select("*", { count: "exact" })
    .order("at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }
  const log = data ?? [];
  if (log.length === 0) return { ...empty, total: count ?? 0 };

  // One round-trip each for the decisions and the card titles, not one per row.
  const decisionIds = [...new Set(log.map((r) => r.decision_id).filter((n): n is number => typeof n === "number"))];
  const decisions = decisionIds.length
    ? (await sb.from("claude_decision_log").select("id, decision, status, rollout_stage").in("id", decisionIds)).data ?? []
    : [];
  const decisionById = new Map(decisions.map((d) => [d.id as number, d]));

  const pendingIds = [...new Set(log.filter((r) => r.target_table === "claude_pending_items").map((r) => r.target_id))];
  const pending = pendingIds.length
    ? (await sb.from("claude_pending_items").select("id, description").in("id", pendingIds)).data ?? []
    : [];
  const pendingById = new Map(pending.map((r) => [r.id as number, r.description as string]));

  // Stale-lane rulings point at claude_known_issues, which Release 1 never had
  // to read here.
  const issueIds = [...new Set(log.filter((r) => r.target_table === "claude_known_issues").map((r) => r.target_id))];
  const issues = issueIds.length
    ? (await sb.from("claude_known_issues").select("id, description").in("id", issueIds)).data ?? []
    : [];
  const issueById = new Map(issues.map((r) => [r.id as number, r.description as string]));

  // How many cards each batch on this page ruled, so one entry can stand for
  // fifty. Counted across the whole log rather than the page, because a batch's
  // members and its summary can straddle a page boundary.
  const batchIds = [...new Set(log.map((r) => r.batch_id).filter(Boolean))] as string[];
  const batchSizes = new Map<string, number>();
  if (batchIds.length) {
    const members = await sb
      .from("claude_rulings_log")
      .select("batch_id, action")
      .in("batch_id", batchIds);
    for (const m of members.data ?? []) {
      if (m.action === "batch_apply" || m.action === "batch_undo") continue;
      const k = m.batch_id as string;
      batchSizes.set(k, (batchSizes.get(k) ?? 0) + 1);
    }
  }

  // Flip count per card: how many rulings that card has accumulated beyond the first.
  const counts = new Map<string, number>();
  const allTargets = await sb
    .from("claude_rulings_log")
    .select("target_table, target_id")
    .in("target_id", [...new Set(log.map((r) => r.target_id))]);
  for (const r of allTargets.data ?? []) {
    const k = `${r.target_table}:${r.target_id}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const rows: DecidedRow[] = log.map((r) => {
    const d = r.decision_id != null ? decisionById.get(r.decision_id) : undefined;
    return {
      id: r.id, at: r.at, ruled_by: r.ruled_by, via: r.via, action: r.action,
      target_table: r.target_table, target_id: r.target_id, reason: r.reason,
      reverses_id: r.reverses_id, reversed_by: r.reversed_by,
      decision_id: r.decision_id, rec_verdict: r.rec_verdict,
      decision_text: (d?.decision as string) ?? null,
      decision_status: (d?.status as string) ?? null,
      rollout_stage: (d?.rollout_stage as string) ?? null,
      flip_count: Math.max(0, (counts.get(`${r.target_table}:${r.target_id}`) ?? 1) - 1),
      card_title: r.target_table === "claude_pending_items"
        ? pendingById.get(r.target_id) ?? null
        : r.target_table === "claude_known_issues"
          ? issueById.get(r.target_id) ?? `Issue #${r.target_id}`
          : `Conflict #${r.target_id}`,
      batch_id: (r.batch_id as string) ?? null,
      batch_size: r.batch_id ? (batchSizes.get(r.batch_id as string) ?? 1) : 1,
      // claude_rule_batch writes a summary only when it ruled more than one
      // card, so this is exactly "was this a pass rather than a click".
      is_batch_summary: r.action === "batch_apply" || r.action === "batch_undo",
    };
  });

  return { rows, total: count ?? 0, page: p, pageSize: PAGE_SIZE, needsMigration: false, error: null };
}


/** How many recent rulings the agreement score is measured over. */
export const AGREEMENT_WINDOW = 500;
/** Below this the percentage is noise, so the tile shows a dash instead. */
export const AGREEMENT_MIN_SAMPLE = 10;

export type AgreementBucket = { agreed: number; total: number };

export type Agreement = {
  agreed: number;
  overridden: number;
  total: number;
  byConfidence: Record<Confidence, AgreementBucket>;
  needsMigration: boolean;
  error: string | null;
};

const EMPTY_BUCKETS = (): Record<Confidence, AgreementBucket> => ({
  high: { agreed: 0, total: 0 },
  medium: { agreed: 0, total: 0 },
  low: { agreed: 0, total: 0 },
  no_evidence: { agreed: 0, total: 0 },
});

/**
 * How often the ruling matched the recommendation — the answer to "is the AI
 * any good?", measured rather than asserted.
 *
 * claude_rulings_log stamps rec_verdict on every ruling, so agreement is that
 * column against the verdict the chosen action produces. verdictFor() is reused
 * rather than reimplemented in SQL: the whole comparison is only meaningful if
 * this page, memory_rule and the recommender all mean the same thing by
 * "approve", and there is exactly one function that decides that.
 *
 * Confidence is read back off the source card. A ruled card is closed, not
 * deleted, and recommendations only ever run on OPEN cards, so the value still
 * on the row is the one that was on screen when the ruling was made.
 *
 * Two kinds of row are excluded rather than guessed at:
 *   - stage / flip / recheck / not_relevant, which verdictFor() has no verdict
 *     for, because they are not answers to the card's question.
 *   - pick_option, whose verdict carries the chosen index ("pick:2") and the log
 *     has no option_key column to rebuild it from. A small slice, dropped
 *     honestly rather than counted as a disagreement.
 */
export const getAgreement = unstable_cache(
  getAgreementUncached,
  ["command-center-agreement"],
  // On the critical path of every page render, including the one right after a
  // ruling. The answer cannot move between two clicks by enough to matter, and
  // a stale-by-30s hit rate is worth more than a fresh one nobody waited for.
  { revalidate: 30, tags: ["command-center-agreement"] },
);

async function getAgreementUncached(): Promise<Agreement> {
  const empty: Agreement = {
    agreed: 0, overridden: 0, total: 0,
    byConfidence: EMPTY_BUCKETS(), needsMigration: false, error: null,
  };

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const { data, error } = await sb
    .from("claude_rulings_log")
    .select("action, target_table, target_id, rec_verdict")
    .not("rec_verdict", "is", null)
    .neq("action", "pick_option")
    .order("at", { ascending: false })
    .limit(AGREEMENT_WINDOW);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }

  const rows = (data ?? []).filter((r) => verdictFor(r.action as RuleAction) !== null);
  if (rows.length === 0) return empty;

  // One round-trip per source table, not one per ruling.
  const confidenceOf = new Map<string, Confidence>();
  for (const table of ["claude_pending_items", "claude_memory_conflicts"] as const) {
    const ids = [...new Set(rows.filter((r) => r.target_table === table).map((r) => r.target_id))];
    if (ids.length === 0) continue;
    const res = await sb.from(table).select("id, rec_confidence").in("id", ids);
    for (const c of res.data ?? []) {
      if (c.rec_confidence) confidenceOf.set(`${table}:${c.id}`, c.rec_confidence as Confidence);
    }
  }

  const byConfidence = EMPTY_BUCKETS();
  let agreed = 0;

  for (const r of rows) {
    const match = verdictFor(r.action as RuleAction) === r.rec_verdict;
    if (match) agreed += 1;
    const conf = confidenceOf.get(`${r.target_table}:${r.target_id}`);
    // A ruling whose card no longer carries a confidence still counts in the
    // headline; it just cannot be filed under a band.
    if (conf && conf in byConfidence) {
      byConfidence[conf].total += 1;
      if (match) byConfidence[conf].agreed += 1;
    }
  }

  return {
    agreed,
    overridden: rows.length - agreed,
    total: rows.length,
    byConfidence,
    needsMigration: false,
    error: null,
  };
}

/** A whole-number percentage, or null when there is not enough to say. */
export function agreementPct(b: AgreementBucket | { agreed: number; total: number }): number | null {
  if (b.total < AGREEMENT_MIN_SAMPLE) return null;
  return Math.round((b.agreed / b.total) * 100);
}
