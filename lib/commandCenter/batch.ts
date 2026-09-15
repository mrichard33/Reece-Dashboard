/**
 * Command Center — batch passes.
 *
 * Pure, no I/O, no React, kept in lib/ so it is unit-tested directly (vitest
 * here runs in the node environment; there is no .tsx test infrastructure).
 *
 * 624 stale issues and 2,400 to-dos cannot be cleared one click at a time. But
 * a bulk close is how a system quietly loses the one real item in a thousand,
 * so every rule below exists to make a batch do only what a person would have
 * done anyway, and to make it undoable whole:
 *
 *   high confidence only  a batch is the recommendation acting on its own word
 *   50 at a time          about as many lines as anyone actually reads
 *   proof for `fixed`     closing on a guess is worse than leaving it open
 *   no Rulings cards      a decision is never a bulk action
 *
 * claude_rule_batch enforces all of it again — this is not a security boundary.
 * But the page must agree with it, or a pass bounces after the person has
 * already checked fifty boxes.
 */

import {
  BATCH_MAX,
  LANE_ACTION_TABLE,
  groupLabel,
  type Lane,
  type QueueCard,
  type RuleAction,
} from "./rules";

/** The verdicts a batch can apply, per lane. */
export const BATCHABLE: Record<Lane, RuleAction[]> = {
  rulings: [],
  stale: ["still_broken", "fixed", "no_longer_matters"],
  todos: ["done", "drop", "keep", "assign"],
};

/** One card inside a group, reduced to what the checkbox row needs. */
export type BatchItem = {
  source_table: QueueCard["source_table"];
  source_id: number;
  description: string | null;
  card_version: string | null;
  age_days: number | null;
  area: string | null;
  /** The first PR / file / decision the recommendation cited, if any. */
  proof: string | null;
  omi_action_item_id: string | null;
};

export type BatchGroup = {
  key: string;
  label: string;
  lane: Lane;
  verdict: RuleAction;
  items: BatchItem[];
  /** How many cards share this key in total, before the 50 cap. */
  total: number;
  /** True when the cap left some behind — the UI says so rather than hiding it. */
  capped: boolean;
};

/**
 * The first citation that looks like evidence a person can click. A batch of
 * `fixed` needs one per card, and the recommendation already found it — asking
 * the ruler to paste fifty links would make the honest path the expensive one.
 */
export function proofFrom(card: Pick<QueueCard, "rec_evidence">): string | null {
  const ev = Array.isArray(card.rec_evidence) ? card.rec_evidence : [];
  const ranked = [...ev].sort((a, b) => rank(a.type) - rank(b.type));
  const best = ranked.find((e) => String(e?.ref ?? "").trim());
  return best ? String(best.ref).trim() : null;
}
function rank(type: string): number {
  // A merged PR is the strongest thing we can show; a bare query is the weakest.
  return ["pr", "file", "decision", "issue", "workflow", "query"].indexOf(type) + 1 || 99;
}

/**
 * Group high-confidence cards by the reason they share.
 *
 * Only `high` gets in. Medium means "I am not sure", and unsure work is exactly
 * what a person should look at one card at a time — so a medium card is not
 * hidden, it simply does not appear in a group.
 *
 * A `fixed` card with no proof is dropped from its group for the same reason:
 * the batch would be refused anyway, and a checkbox that cannot be applied is
 * worse than no checkbox.
 */
export function buildGroups(cards: QueueCard[], lane: Lane): BatchGroup[] {
  const allowed = new Set(BATCHABLE[lane]);
  const byKey = new Map<string, { verdict: RuleAction; all: BatchItem[] }>();

  for (const c of cards) {
    if (c.rec_confidence !== "high") continue;
    const verdict = String(c.rec_verdict ?? "") as RuleAction;
    if (!allowed.has(verdict)) continue;
    if (LANE_ACTION_TABLE[verdict] !== c.source_table) continue;

    const proof = proofFrom(c);
    if (verdict === "fixed" && !proof) continue;

    const key = c.rec_group_key ?? `${verdict}:ungrouped`;
    if (!byKey.has(key)) byKey.set(key, { verdict, all: [] });
    byKey.get(key)!.all.push({
      source_table: c.source_table,
      source_id: c.source_id,
      description: c.description,
      card_version: c.card_version,
      age_days: c.age_days,
      area: c.area,
      proof,
      omi_action_item_id: c.omi_action_item_id,
    });
  }

  return [...byKey.entries()]
    .map(([key, { verdict, all }]) => ({
      key,
      label: groupLabel(key),
      lane,
      verdict,
      items: all.slice(0, BATCH_MAX),
      total: all.length,
      capped: all.length > BATCH_MAX,
    }))
    // Biggest group first: the most work cleared per read.
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export type BatchGuard =
  | { ok: true; count: number }
  | { ok: false; count: number; reason: string };

/**
 * Can this selection be applied? Returns the sentence to show on a disabled
 * button, rather than a boolean the caller has to translate.
 */
export function canApply(group: BatchGroup, checkedIds: number[]): BatchGuard {
  const count = checkedIds.length;
  if (count === 0) return { ok: false, count, reason: "Nothing checked." };
  if (count > BATCH_MAX) {
    return {
      ok: false,
      count,
      reason: `${count} checked — a pass rules at most ${BATCH_MAX} at once, because ${BATCH_MAX} is about as many lines as anyone reads before clicking. Uncheck ${count - BATCH_MAX}.`,
    };
  }
  const checked = new Set(checkedIds);
  const chosen = group.items.filter((i) => checked.has(i.source_id));
  if (group.verdict === "fixed") {
    const missing = chosen.filter((i) => !i.proof);
    if (missing.length) {
      return {
        ok: false,
        count,
        reason: `${missing.length} of these have no link to what fixed them. Closing an issue as fixed on a guess is worse than leaving it open — uncheck them, or rule them one at a time.`,
      };
    }
  }
  return { ok: true, count };
}

/** The payload memory_rule's batch_apply expects. */
export type BatchApplyInput = {
  action: "batch_apply";
  verdict: RuleAction;
  rec_group_key: string;
  reason?: string;
  assignee?: string;
  targets: { table: QueueCard["source_table"]; id: number; card_version: string | null; proof?: string }[];
};

export function toApplyInput(
  group: BatchGroup,
  checkedIds: number[],
  extra: { reason?: string; assignee?: string } = {},
): BatchApplyInput {
  const checked = new Set(checkedIds);
  return {
    action: "batch_apply",
    verdict: group.verdict,
    rec_group_key: group.key,
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.assignee ? { assignee: extra.assignee } : {}),
    targets: group.items
      .filter((i) => checked.has(i.source_id))
      .map((i) => ({
        table: i.source_table,
        id: i.source_id,
        // Sent so claude_rule_batch can drop the WHOLE pass if any card moved
        // since the screen loaded. A partly-applied batch is the one outcome
        // there is no good way to explain.
        card_version: i.card_version,
        ...(i.proof ? { proof: i.proof } : {}),
      })),
  };
}
