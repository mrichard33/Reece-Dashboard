import { lpService } from "@/lib/supabase/lp";
import type { ChangeLane, ChangeRepo, PromptInput } from "@/lib/changes/buildPrompt";

/**
 * Command Center — the Changes lane reads.
 *
 * Degrades the same way lib/queries/commandCenter.ts does: if migration 0020 has
 * not been applied the table does not exist, and each function returns an empty
 * result with `needsMigration` set so the page can say which step is missing
 * rather than rendering an empty lane that looks broken.
 */

export const PAGE_SIZE = 25;

/** Postgres says 42P01 for "relation does not exist" — i.e. 0020 isn't applied. */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /does not exist/i.test(error.message ?? "");
}

/** Every state the derived-status trigger can produce (migration 0020 §2). */
export const CHANGE_STATUSES = [
  "proposed", "approved", "testing", "in_review", "deployed", "failed", "rejected", "rolled_back",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** Statuses that still want something from you. Drives the default filter. */
export const OPEN_STATUSES: ChangeStatus[] = ["proposed", "approved", "testing", "in_review", "failed"];

export type ChangeRow = {
  id: number;
  decision_id: number | null;
  build_item_id: number | null;
  lane: ChangeLane | null;
  repo: ChangeRepo | null;
  title: string;
  summary: string | null;
  prompt_text: string | null;
  prompt_version: number;
  status: ChangeStatus;
  pr_number: number | null;
  pr_url: string | null;
  ci_conclusion: string | null;
  reject_reason: string | null;
  failure_reason: string | null;
  needs_manual: boolean;
  created_at: string;
  updated_at: string;
  /** Joined from claude_decision_log when the change came from a ruling. */
  decision_text: string | null;
  decision_rationale: string | null;
  category: string | null;
  area: string | null;
  /** Joined from the originating build item. */
  ref: string | null;
};

export type ChangesResult = {
  rows: ChangeRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  needsMigration: boolean;
  error: string | null;
};

/**
 * The lane, newest first.
 *
 * The decision and the build item are fetched in one round-trip each rather than
 * one per row — the same shape as getDecided() in commandCenter.ts. Most rows
 * have no decision at all (the backfilled backlog was captured in working
 * sessions, not filed by a ruling), so the join is expected to miss.
 */
export async function getChanges({
  status = null, lane = null, page = 1,
}: { status?: string | null; lane?: string | null; page?: number } = {}): Promise<ChangesResult> {
  const p = Math.max(1, page);
  const from = (p - 1) * PAGE_SIZE;
  const empty: ChangesResult = {
    rows: [], total: 0, page: p, pageSize: PAGE_SIZE, counts: {},
    needsMigration: false, error: null,
  };

  let sb;
  try { sb = lpService(); } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  let q = sb.from("claude_changes").select("*", { count: "exact" });
  if (status === "open") q = q.in("status", OPEN_STATUSES);
  else if (status) q = q.eq("status", status);
  if (lane) q = q.eq("lane", lane);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    if (isMissingRelation(error)) return { ...empty, needsMigration: true };
    return { ...empty, error: error.message };
  }

  const changes = data ?? [];

  // Tab counts, so the filter shows what is behind it before you click.
  const counts: Record<string, number> = {};
  const all = await sb.from("claude_changes").select("status");
  for (const r of all.data ?? []) counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  counts.open = OPEN_STATUSES.reduce((n, s) => n + (counts[s] ?? 0), 0);

  if (changes.length === 0) return { ...empty, total: count ?? 0, counts };

  const decisionIds = [...new Set(changes.map((c) => c.decision_id).filter((n): n is number => typeof n === "number"))];
  const decisions = decisionIds.length
    ? (await sb.from("claude_decision_log").select("id, decision, rationale, category, area").in("id", decisionIds)).data ?? []
    : [];
  const decisionById = new Map(decisions.map((d) => [d.id as number, d]));

  const itemIds = [...new Set(changes.map((c) => c.build_item_id).filter((n): n is number => typeof n === "number"))];
  const items = itemIds.length
    ? (await sb.from("claude_pending_items").select("id, ref, area").in("id", itemIds)).data ?? []
    : [];
  const itemById = new Map(items.map((i) => [i.id as number, i]));

  const rows: ChangeRow[] = changes.map((c) => {
    const d = c.decision_id != null ? decisionById.get(c.decision_id) : undefined;
    const item = c.build_item_id != null ? itemById.get(c.build_item_id) : undefined;
    return {
      ...(c as ChangeRow),
      decision_text: (d?.decision as string) ?? null,
      decision_rationale: (d?.rationale as string) ?? null,
      category: (d?.category as string) ?? null,
      area: (d?.area as string) ?? (item?.area as string) ?? null,
      ref: (item?.ref as string) ?? null,
    };
  });

  return { rows, total: count ?? 0, page: p, pageSize: PAGE_SIZE, counts, needsMigration: false, error: null };
}

/** One change, shaped for buildPrompt(). Read fresh — the prompt must match the row. */
export async function getPromptInput(id: number): Promise<PromptInput | null> {
  let sb;
  try { sb = lpService(); } catch { return null; }

  const { data, error } = await sb.from("claude_changes").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;

  const d = data.decision_id != null
    ? (await sb.from("claude_decision_log").select("decision, rationale, category, area").eq("id", data.decision_id).maybeSingle()).data
    : null;
  const item = data.build_item_id != null
    ? (await sb.from("claude_pending_items").select("ref, area, rec_evidence").eq("id", data.build_item_id).maybeSingle()).data
    : null;

  return {
    id: data.id,
    lane: data.lane, repo: data.repo,
    title: data.title, summary: data.summary,
    decisionId: data.decision_id,
    decisionText: (d?.decision as string) ?? null,
    decisionRationale: (d?.rationale as string) ?? null,
    category: (d?.category as string) ?? null,
    area: (d?.area as string) ?? (item?.area as string) ?? null,
    evidence: (item?.rec_evidence as PromptInput["evidence"]) ?? null,
    ref: (item?.ref as string) ?? null,
  };
}
