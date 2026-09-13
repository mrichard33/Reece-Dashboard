import { unstable_cache } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { verdictFor } from "@/lib/commandCenter/rules";
import type { QueueCard, Confidence, RuleAction } from "@/lib/commandCenter/rules";

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

/** Postgres says 42P01 for "relation does not exist" — i.e. sql/102 isn't applied. */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

export type QueueFilters = {
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
  const from = (page - 1) * PAGE_SIZE;
  const empty: QueueResult = {
    cards: [], total: 0, page, pageSize: PAGE_SIZE, areas: [],
    needsMigration: false, error: null,
  };

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  let q = sb
    .from("v_command_center_queue")
    .select("*", { count: "exact" })
    .eq("lane", "rulings");

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
    .eq("lane", "rulings")
    .not("area", "is", null);
  const areas = [...new Set((areaRes.data ?? []).map((r) => r.area as string))].sort();

  return {
    cards: (data ?? []) as QueueCard[],
    total: count ?? 0,
    page, pageSize: PAGE_SIZE, areas,
    needsMigration: false, error: null,
  };
}

export type HeaderStats = {
  rulingsOpen: number;
  staleIssuesOpen: number;
  todosOpen: number;
  oldestRulingDays: number | null;
  ruledThisWeek: number;
  ruledLastWeek: number;
  needsMigration: boolean;
  error: string | null;
};

/** The four tiles across the top. */
export async function getHeader(): Promise<HeaderStats> {
  const empty: HeaderStats = {
    rulingsOpen: 0, staleIssuesOpen: 0, todosOpen: 0, oldestRulingDays: null,
    ruledThisWeek: 0, ruledLastWeek: 0, needsMigration: false, error: null,
  };
  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const queue = await sb
    .from("v_command_center_queue")
    .select("age_days", { count: "exact" })
    .eq("lane", "rulings")
    .order("age_days", { ascending: false })
    .limit(1);
  if (queue.error) {
    if (isMissingRelation(queue.error)) return { ...empty, needsMigration: true };
    return { ...empty, error: queue.error.message };
  }

  // Release 2 lanes: counted, not shown.
  const stale = await sb
    .from("claude_known_issues")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "in_progress"])
    .eq("stale", true);

  const todos = await sb
    .from("claude_pending_items")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "blocked"])
    .not("item_type", "in", "(decision_needed,unconfirmed_decision,open_question,approval_needed)");

  // This week against last week, so the header shows movement rather than a pile.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const thisWeek = await sb
    .from("claude_rulings_log")
    .select("id", { count: "exact", head: true })
    .gte("at", weekAgo);
  const lastWeek = await sb
    .from("claude_rulings_log")
    .select("id", { count: "exact", head: true })
    .gte("at", twoWeeksAgo)
    .lt("at", weekAgo);

  return {
    rulingsOpen: queue.count ?? 0,
    staleIssuesOpen: stale.count ?? 0,
    todosOpen: todos.count ?? 0,
    oldestRulingDays: queue.data?.[0]?.age_days ?? null,
    ruledThisWeek: thisWeek.count ?? 0,
    ruledLastWeek: lastWeek.count ?? 0,
    needsMigration: false,
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
        : `Conflict #${r.target_id}`,
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
