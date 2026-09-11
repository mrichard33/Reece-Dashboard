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

/** The four pending-item types plus conflicts, as v_command_center_queue emits them. */
export type CardType =
  | "decision_needed"
  | "unconfirmed_decision"
  | "open_question"
  | "approval_needed"
  | "conflict";

/** Every ruling action Release 1 sends to memory_rule. */
export type RuleAction =
  | "approve" | "edit_approve" | "reject" | "pick_option" | "own_answer"
  | "yes" | "no" | "keep_left" | "keep_right" | "not_a_conflict" | "new_answer"
  | "snooze" | "not_relevant" | "stage" | "flip" | "recheck";

export type Confidence = "high" | "medium" | "low" | "no_evidence";
export type Risk = "money" | "live_leads" | "customer_messaging" | "none";
export type RolloutStage = "decided" | "built" | "verified" | "no_build";

/** One row of v_command_center_queue. */
export type QueueCard = {
  lane: "rulings";
  card_type: CardType;
  source_table: "claude_pending_items" | "claude_memory_conflicts";
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
};

export type RecEvidence = {
  type: "decision" | "issue" | "workflow" | "pr" | "file" | "query";
  ref: string;
  note: string;
};

/** One button on a card: what it says, what it sends, and how it looks. */
export type CardButton = {
  action: RuleAction;
  label: string;
  /** primary = the affirmative answer; danger = the negative one; the rest are quiet. */
  tone: "primary" | "secondary" | "ghost" | "danger";
  /** The button opens a dialog before anything is sent. */
  opens?: "approve" | "snooze" | "option";
};

const NOT_NOW: CardButton = { action: "snooze", label: "Not now", tone: "ghost", opens: "snooze" };
const NOT_RELEVANT: CardButton = { action: "not_relevant", label: "No longer relevant", tone: "ghost" };

/**
 * The buttons a card offers. Mirrors the decisions in the Command Center
 * design: a decision or question is answered, an unconfirmed or Omi proposal is
 * approved or rejected, a conflict picks a side, an approval is yes or no.
 */
export function buttonsFor(card: Pick<QueueCard, "card_type" | "options">): CardButton[] {
  switch (card.card_type) {
    case "decision_needed":
    case "open_question": {
      const out: CardButton[] = [];
      if (card.options && card.options.length > 0) {
        out.push({ action: "pick_option", label: "Pick option", tone: "primary", opens: "option" });
      }
      out.push({ action: "own_answer", label: "Write my own answer", tone: card.options?.length ? "secondary" : "primary", opens: "approve" });
      out.push(NOT_NOW, NOT_RELEVANT);
      return out;
    }
    case "unconfirmed_decision":
      return [
        { action: "approve", label: "Approve", tone: "primary" },
        { action: "edit_approve", label: "Edit, then approve", tone: "secondary", opens: "approve" },
        { action: "reject", label: "Reject", tone: "danger" },
        NOT_NOW,
      ];
    case "conflict":
      return [
        { action: "keep_left", label: "Keep left", tone: "primary" },
        { action: "keep_right", label: "Keep right", tone: "primary" },
        { action: "not_a_conflict", label: "Not a conflict", tone: "secondary" },
        { action: "new_answer", label: "Write a new answer", tone: "secondary", opens: "approve" },
      ];
    case "approval_needed":
      return [
        { action: "yes", label: "Yes", tone: "primary" },
        { action: "no", label: "No", tone: "danger" },
        NOT_NOW,
      ];
    default:
      return [];
  }
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
};

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
 * What the Approve dialog should start with: the card's own words with the
 * provenance stripped, else the recommended wording.
 */
export function prefillDecisionText(card: Pick<QueueCard, "description" | "rec_decision_text">): string {
  const stripped = stripOmiPrefix(card.description);
  return stripped || String(card.rec_decision_text ?? "");
}

/** Error codes memory_rule returns that the page has a specific answer for. */
export type RuleErrorCode =
  | "stale_card" | "already_reversed" | "changed_since" | "guard_conflict"
  | "reason_required" | "proof_required" | "not_in_release" | "bad_input"
  | "not_admin" | "recommend_off" | "error";

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
      return { text: message || "Verified needs a line saying what proved it.", reload: false };
    default:
      return { text: message || "That didn't save. Nothing was changed.", reload: false };
  }
}
