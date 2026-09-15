/**
 * Command Center — the rules that decide what a card offers and what it demands.
 *
 * Pure, no I/O, no React. This is the half of the page that has to be RIGHT
 * rather than pretty: which buttons a card type gets, when a reason is
 * mandatory, and how a card's own words are cleaned up for display. The server
 * action and LP MCP enforce all of it again — nothing here is a security
 * boundary — but the page must agree with them, or every other ruling bounces.
 *
 * Kept in lib/ (not components/) so it is unit-tested directly.
 */

/** Every card type v_command_center_queue emits, across all three lanes. */
export type CardType =
  // Rulings lane (sql/102).
  | "decision_needed"
  | "unconfirmed_decision"
  | "open_question"
  | "approval_needed"
  | "conflict"
  // Release 2 lanes (sql/112). One type each, because every card in a lane asks
  // the same question: "is this still broken?" and "is this still yours?".
  | "stale_issue"
  | "todo";

/** The three lanes. The view says which one a row belongs to. */
export type Lane = "rulings" | "stale" | "todos";

/** Every action memory_rule accepts. */
export type RuleAction =
  // Rulings lane (sql/102).
  | "approve" | "edit_approve" | "reject" | "pick_option" | "own_answer"
  | "yes" | "no" | "keep_left" | "keep_right" | "not_a_conflict" | "new_answer"
  | "snooze" | "not_relevant" | "stage" | "flip" | "recheck"
  // Stale-issue lane (sql/112).
  | "still_broken" | "fixed" | "no_longer_matters"
  // To-do lane (sql/112).
  | "done" | "drop" | "keep" | "assign"
  // Batch passes (sql/112). These address a group, never one card.
  | "batch_apply" | "batch_undo";

/** The lane verdicts, and which table each one may touch. */
export const LANE_ACTION_TABLE: Partial<Record<RuleAction, QueueCard["source_table"]>> = {
  still_broken: "claude_known_issues",
  fixed: "claude_known_issues",
  no_longer_matters: "claude_known_issues",
  done: "claude_pending_items",
  drop: "claude_pending_items",
  keep: "claude_pending_items",
  assign: "claude_pending_items",
};

/** A batch never exceeds this. Mirrors BATCH_MAX in LP-MCP's memory-rule.js. */
export const BATCH_MAX = 50;

export type Confidence = "high" | "medium" | "low" | "no_evidence";
export type Risk = "money" | "live_leads" | "customer_messaging" | "none";
export type RolloutStage = "decided" | "built" | "verified" | "no_build";

/** One row of v_command_center_queue. */
export type QueueCard = {
  lane: Lane;
  card_type: CardType;
  source_table: "claude_pending_items" | "claude_memory_conflicts" | "claude_known_issues";
  source_id: number;
  description: string | null;
  options: string[] | null;
  origin: string | null;
  area: string | null;
  created_at: string;
  age_days: number | null;
  rec_verdict: string | null;
  rec_reason: string | null;
  rec_evidence: RecEvidence[] | null;
  rec_confidence: Confidence | null;
  rec_risk: Risk | null;
  rec_decision_text: string | null;
  rec_category: string | null;
  rec_build_text: string | null;
  rec_at: string | null;
  left_id: number | null;
  left_text: string | null;
  left_origin: string | null;
  left_confidence: string | null;
  left_date: string | null;
  left_status: string | null;
  left_rollout_stage: string | null;
  right_id: number | null;
  right_text: string | null;
  right_origin: string | null;
  right_confidence: string | null;
  right_date: string | null;
  right_status: string | null;
  right_rollout_stage: string | null;
  conflict_kind: string | null;
  similarity: number | null;
  blocks_count: number;
  card_version: string | null;
  /** The reason slug a batch pass groups by. Null until the nightly writes one. */
  rec_group_key: string | null;
  /** Set when this to-do is already a task in Mark's Omi. */
  omi_action_item_id: string | null;
  /** The to-do lane's display label — ~150 raw item_type values mapped onto four. */
  item_type_norm: string | null;
};

export type RecEvidence = {
  type: "decision" | "issue" | "workflow" | "pr" | "file" | "query";
  ref: string;
  note: string;
};

/**
 * Which button this is, independent of the action it sends. Two buttons on one
 * card can share an action — Approve and Edit both send own_answer on a question
 * card — so the id, not the action, is what identifies a button.
 */
export type ButtonId =
  | "approve" | "edit" | "reject" | "pick"
  | "keep_left" | "keep_right" | "not_a_conflict"
  | "snooze" | "not_relevant"
  // Stale-issue lane.
  | "still_broken" | "fixed" | "no_longer_matters"
  // To-do lane.
  | "done" | "drop" | "keep" | "assign";

/** One button on a card: what it says, what it sends, and how it looks. */
export type CardButton = {
  id: ButtonId;
  action: RuleAction;
  label: string;
  /** primary = the affirmative answer; danger = the negative one; the rest are quiet. */
  tone: "primary" | "secondary" | "ghost" | "danger";
  /** The button opens a dialog before anything is sent. */
  opens?: "approve" | "snooze" | "option" | "proof" | "assign";
  /**
   * Send the recommendation's own wording, category and build straight through,
   * with no dialog. Set on Approve only.
   *
   * This is not a convenience. Left off, claude_rule_apply falls back to the
   * card's DESCRIPTION — which on a question card is the QUESTION — and files a
   * question where the answer belongs.
   */
  fillsFromRecommendation?: boolean;
};

const NOT_NOW: CardButton = { id: "snooze", action: "snooze", label: "Not now", tone: "ghost", opens: "snooze" };
const NOT_RELEVANT: CardButton = { id: "not_relevant", action: "not_relevant", label: "No longer relevant", tone: "ghost" };

/** Does this card carry a recommended answer there is something to approve? */
function hasRecText(card: Pick<QueueCard, "rec_decision_text">): boolean {
  return String(card.rec_decision_text ?? "").trim().length > 0;
}

/**
 * The buttons a card offers.
 *
 * Every card asks the same three questions — take it, change it, or turn it
 * down — so every card leads with Approve / Edit / Reject, and the extras that
 * only make sense for that type sit behind them.
 *
 * Buttons mean what they say about the ITEM, never "do what the AI said". The
 * recommendation is a marker on whichever button matches it (suggestedButton),
 * so agreeing is one click and disagreeing costs one sentence — but a button
 * labelled Approve never performs a rejection.
 *
 * A card the nightly has not reached is still fully rulable: Approve drops off
 * (there is no proposed answer to accept) and Edit becomes the way in.
 */
export function buttonsFor(
  card: Pick<QueueCard, "card_type" | "options" | "rec_decision_text">,
): CardButton[] {
  const rec = hasRecText(card);

  switch (card.card_type) {
    case "decision_needed":
    case "open_question": {
      const out: CardButton[] = [];
      if (rec) {
        out.push({ id: "approve", action: "own_answer", label: "Approve", tone: "primary", fillsFromRecommendation: true });
      }
      out.push({
        id: "edit",
        action: "own_answer",
        label: rec ? "Edit" : "Write my own answer",
        tone: rec ? "secondary" : "primary",
        opens: "approve",
      });
      out.push({ id: "reject", action: "reject", label: "Reject", tone: "danger" });
      if (card.options && card.options.length > 0) {
        out.push({ id: "pick", action: "pick_option", label: "Pick option", tone: "secondary", opens: "option" });
      }
      out.push(NOT_NOW, NOT_RELEVANT);
      return out;
    }

    case "unconfirmed_decision":
      return [
        // Carries the recommended wording when there is one, so Approve and an
        // untouched Edit file the same sentence instead of two different ones.
        { id: "approve", action: "approve", label: "Approve", tone: "primary", fillsFromRecommendation: rec },
        { id: "edit", action: "edit_approve", label: "Edit", tone: "secondary", opens: "approve" },
        { id: "reject", action: "reject", label: "Reject", tone: "danger" },
        NOT_NOW,
      ];

    case "approval_needed":
      return [
        { id: "approve", action: "yes", label: "Approve", tone: "primary", fillsFromRecommendation: rec },
        { id: "reject", action: "no", label: "Reject", tone: "danger" },
        NOT_NOW,
      ];

    // A stale issue asks ONE question: is this still broken? So the affirmative
    // is "yes, still broken" — which changes nothing but the clock — and it is
    // deliberately the primary. Closing an issue is the answer that needs
    // evidence, not the answer that needs to be easy.
    case "stale_issue":
      return [
        { id: "still_broken", action: "still_broken", label: "Still broken", tone: "primary" },
        // opens the proof dialog: claude_rule_batch refuses a fixed with no
        // proof, so the button collects one rather than sending a doomed call.
        { id: "fixed", action: "fixed", label: "Fixed", tone: "secondary", opens: "proof" },
        { id: "no_longer_matters", action: "no_longer_matters", label: "No longer matters", tone: "ghost" },
      ];

    // A to-do asks: is this still yours? "Keep" snoozes for 30 days and closes
    // nothing, which is why it is safe to be the quiet default.
    case "todo":
      return [
        { id: "done", action: "done", label: "Done", tone: "primary" },
        { id: "drop", action: "drop", label: "Drop", tone: "danger" },
        { id: "keep", action: "keep", label: "Keep", tone: "secondary" },
        { id: "assign", action: "assign", label: "Assign", tone: "ghost", opens: "assign" },
      ];

    case "conflict":
      // A conflict is a two-sided pick, so the affirmative is "which side", not
      // "approve". Edit writes a third answer that replaces both.
      return [
        { id: "keep_left", action: "keep_left", label: "Keep left", tone: "primary" },
        { id: "keep_right", action: "keep_right", label: "Keep right", tone: "primary" },
        { id: "edit", action: "new_answer", label: "Edit", tone: "secondary", opens: "approve" },
        { id: "not_a_conflict", action: "not_a_conflict", label: "Not a conflict", tone: "secondary" },
      ];

    default:
      return [];
  }
}

/**
 * Which button the recommendation points at, so the card can mark it.
 *
 * Matched on the VERDICT the button would produce, not on a hand-written table.
 * That is what makes the marker safe: the marked button is by construction the
 * one needsReason() will let through without an explanation, so "agreeing is one
 * click" holds even if the model answers a card type in an unexpected vocabulary.
 *
 * Returns a button id, and null when the verdict has no button on this card type
 * (a "not_now" on a conflict, say) or the nightly has not reached the card.
 */
export function suggestedButton(
  card: Pick<QueueCard, "card_type" | "options" | "rec_decision_text" | "rec_verdict" | "rec_at">,
): ButtonId | null {
  if (!card.rec_at || !card.rec_verdict) return null;
  const want = card.rec_verdict;

  for (const b of buttonsFor(card)) {
    // The option verdict carries the chosen index ("pick:2"); which option was
    // picked is settled in the dialog, so the button matches on the prefix.
    if (b.id === "pick") {
      if (want.startsWith("pick:")) return "pick";
      continue;
    }
    if (verdictFor(b.action) === want) return b.id;
  }
  return null;
}

/**
 * What the recommendation would have called this ruling. MUST stay identical to
 * verdictFor() in LP-MCP's src/memory/memory-rule.js — the server compares the
 * same two strings, and a mismatch means a ruling bounces with reason_required
 * after the person already typed nothing.
 */
export function verdictFor(action: RuleAction, optionKey?: string | null): string | null {
  switch (action) {
    case "approve": case "edit_approve": return "approve";
    case "pick_option": return `pick:${optionKey ?? ""}`;
    case "own_answer": return "answer";
    case "snooze": return "not_now";
    case "reject": case "no": case "yes":
    case "keep_left": case "keep_right": case "not_a_conflict": case "new_answer":
      return action;
    // The lane verdicts ARE their own verdict names — memory-recommend writes
    // exactly these strings into rec_verdict, so the marker matches by identity.
    case "still_broken": case "fixed": case "no_longer_matters":
    case "done": case "drop": case "keep": case "assign":
      return action;
    default: return null;
  }
}

/** Reason is never optional on these, recommendation or not. */
const ALWAYS_NEEDS_REASON = new Set<RuleAction>(["reject", "no", "flip"]);

/**
 * Does this ruling need a reason before it can be sent? Mirrors memory-rule.js.
 * "Differs from the recommendation" only means anything when there IS one — a
 * card the nightly has not reached yet must not demand an explanation.
 */
export function needsReason(
  action: RuleAction,
  recVerdict: string | null | undefined,
  optionKey?: string | null,
): boolean {
  if (ALWAYS_NEEDS_REASON.has(action)) return true;
  if (!recVerdict) return false;
  if (action === "not_relevant") return true;
  const v = verdictFor(action, optionKey);
  return v !== null && v !== recVerdict;
}

/** The quick-picks offered next to the free-text reason box. */
export const REASON_QUICK_PICKS = [
  "Current setup works",
  "Costs too much",
  "Wrong timing",
  "Already handled",
  "Bad data",
] as const;

/**
 * Omi writes where an item came from into the front of its description. That is
 * provenance, not the proposal, so the page shows the proposal and the badge
 * shows the provenance. MUST match stripOmiPrefix() in memory-rule.js — the
 * text shown here is the text that gets saved.
 */
const OMI_PREFIXES = [
  /^\[Omi \d{4}-\d{2}-\d{2}\]\s*/,
  /^CONFLICTS WITH #\d+\s*—\s*/,
  /^Possible issue heard in Omi\s*—\s*/,
];

export function stripOmiPrefix(text: string | null | undefined): string {
  let out = String(text ?? "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of OMI_PREFIXES) {
      const next = out.replace(re, "");
      if (next !== out) { out = next; changed = true; }
    }
  }
  return out.trim();
}

/** Did this card come from an Omi conversation? */
export function isOmi(card: Pick<QueueCard, "origin" | "description">): boolean {
  if (card.origin === "omi") return true;
  return OMI_PREFIXES.some((re) => re.test(String(card.description ?? "")));
}

/** Human labels for the vocabularies the columns hold. */
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  decision_needed: "Decision needed",
  unconfirmed_decision: "Unconfirmed",
  open_question: "Open question",
  approval_needed: "Approval needed",
  conflict: "Conflict",
  stale_issue: "Stale issue",
  todo: "To-do",
};

/** The lane a card belongs to, from the view's column or its card type. */
export function laneOf(card: Pick<QueueCard, "lane" | "card_type">): Lane {
  if (card.lane === "stale" || card.lane === "todos" || card.lane === "rulings") return card.lane;
  if (card.card_type === "stale_issue") return "stale";
  if (card.card_type === "todo") return "todos";
  return "rulings";
}

/** Plain words for the to-do lane's normalised item type. */
export const ITEM_TYPE_LABEL: Record<string, string> = {
  action_needed: "Action needed",
  build_needed: "Build needed",
  verification_needed: "Needs checking",
  next_step: "Next step",
};

/**
 * Group keys as a heading someone can read and agree with in one line. This is
 * the ONLY thing most people will read before approving fifty cards, so it says
 * what is true of every card in the group, not what the verdict is called.
 */
export const GROUP_KEY_LABEL: Record<string, string> = {
  "fixed:pr-merged": "The PR that fixes these is merged",
  "fixed:verified-elsewhere": "These were verified fixed somewhere else",
  "still_broken:no-evidence-of-fix": "Nothing shows these were ever fixed",
  "no_longer_matters:superseded": "What these were about has been replaced",
  "no_longer_matters:system-retired": "The system these were about is gone",
  "done:pr-merged": "The PR that ships these is merged",
  "done:confirmed-elsewhere": "These were confirmed finished elsewhere",
  "drop:duplicate-of-newer": "A newer item says the same thing",
  "drop:superseded": "These have been superseded",
  "keep:no-evidence": "Nothing new either way — ask again in 30 days",
  "keep:still-open": "Still open and still someone's",
  "assign:owner-named": "The record names who owns these",
};

/** A readable heading for a group, falling back to the raw slug. */
export function groupLabel(key: string | null | undefined): string {
  const k = String(key ?? "").trim();
  if (!k) return "Ungrouped";
  return GROUP_KEY_LABEL[k] ?? k;
}

export const RISK_LABEL: Record<Risk, string> = {
  money: "Money",
  live_leads: "Live leads",
  customer_messaging: "Customer messaging",
  none: "",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  no_evidence: "No evidence either way",
};

export const STAGE_LABEL: Record<RolloutStage, string> = {
  decided: "Decided",
  built: "Built",
  verified: "Verified",
  no_build: "No build needed",
};

/** The twelve categories claude_decision_log.category is drawn from. */
export const CATEGORIES = [
  "architecture", "routing", "messaging", "appointments", "sync", "integration",
  "data", "agentic", "infrastructure", "reporting", "compliance", "operations",
] as const;

/**
 * The sentence that gets filed: what Approve sends, and what the Edit dialog
 * starts from. One function for both, so an untouched Edit saves exactly what
 * Approve would have.
 *
 * The RECOMMENDATION leads, then the card's own words with the provenance
 * stripped. That order is the whole point on a question card, where the
 * description is the QUESTION — filing it would save a question where the answer
 * belongs. claude_rule_apply's own fallback (decisionTextFor in memory-rule.js)
 * prefers the description instead, which is exactly why this page always sends
 * the text explicitly rather than letting the server default fire.
 */
export function prefillDecisionText(card: Pick<QueueCard, "description" | "rec_decision_text">): string {
  const rec = String(card.rec_decision_text ?? "").trim();
  return rec || stripOmiPrefix(card.description);
}

/** Error codes memory_rule returns that the page has a specific answer for. */
export type RuleErrorCode =
  | "stale_card" | "already_reversed" | "changed_since" | "guard_conflict"
  | "reason_required" | "proof_required" | "not_in_release" | "bad_input"
  | "not_admin" | "recommend_off" | "error"
  // Batch refusals (sql/112).
  | "batch_too_large" | "not_batchable" | "confidence_too_low";

/**
 * What to tell the person, and whether the page should reload underneath them.
 * The three "someone else moved this" codes all end the same way: the screen is
 * out of date, so refresh it rather than letting them try again into the same wall.
 */
export function errorMessageFor(code: RuleErrorCode, message?: string): { text: string; reload: boolean } {
  switch (code) {
    case "stale_card":
      return { text: "This card changed while it was on your screen — refreshing.", reload: true };
    case "changed_since":
      return { text: "Something this ruling touched has changed since, so it can't be put back exactly. Refreshing.", reload: true };
    case "already_reversed":
      return { text: "This ruling was already flipped. Refreshing.", reload: true };
    case "not_admin":
      return { text: "Read-only — ruling is admin only.", reload: false };
    case "recommend_off":
      return { text: "Recommendations are switched off (MEMORY_RECOMMEND_MODE).", reload: false };
    case "reason_required":
      return { text: message || "Say why before saving this one.", reload: false };
    case "proof_required":
      return { text: message || "Closing this as fixed needs a link to what fixed it.", reload: false };
    case "batch_too_large":
      return { text: message || `A pass rules at most ${BATCH_MAX} cards at once.`, reload: false };
    case "confidence_too_low":
      // Not a bug and not a wall: the card is still rulable, one at a time.
      return { text: message || "A batch only applies high-confidence recommendations. Rule this one on its own.", reload: false };
    case "not_batchable":
      return { text: message || "That card can't go in a batch — rule it on its own.", reload: false };
    default:
      return { text: message || "That didn't save. Nothing was changed.", reload: false };
  }
}
