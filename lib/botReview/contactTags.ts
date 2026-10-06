/**
 * The GHL tags that decide whether the bot, and Reece, may still reach a lead.
 *
 * These are COPIED from LP MCP, which is the gate. The dashboard only reads
 * them to tell a reviewer what state the lead is in; it never decides a send.
 * If LP MCP changes a list, change it here too — LP MCP wins every disagreement.
 *
 *   Bot stop      LP-MCP src/send-message-handler.js checkConversationGate (~L884):
 *                 `stop-bot` is the only conversation kill switch.
 *   Text opt-out  LP-MCP src/send-message-handler.js checkSuppression (~L865):
 *                 `dnc`, `do-not-contact`, `dnc-sms`, `stage:dnc` hard-block a text.
 *                 Plus the per-channel tags (LP-MCP CLAUDE.md, Consent 2026-09-29:
 *                 "dnc-sms / dnc-voice → calls + texts") and the carrier STOP
 *                 tags in src/consent/consent-store.js DNC_FAMILY_TAGS
 *                 (`suppress:dnc-reply`, `suppress:dnc-voice`).
 *   Call opt-out  The same list: consent channel `phone` means texts AND
 *                 automated calls (LP-MCP CLAUDE.md, Consent). The two never
 *                 split until CONSENT_SPLIT_SMS_CALL ships, which it has not.
 *   Email opt-out LP-MCP src/actions/handlers/info-email.js HARD_OPT_OUT, plus
 *                 `dnc-email` (TAG_DNC_EMAIL_OPTOUT).
 *   Paused        LP-MCP src/services/suppression-check.js SUPPRESS_TAGS, the
 *                 operational (non-consent) part: `suppress-outbound`,
 *                 `hard-disqualified`, `quarantined`, `cooling-active`.
 *   On            `agentic-active` is the canonical "the agentic bot is in
 *                 charge" signal (send-message-handler.js v3.12 notes).
 */

export const BOT_STOP_TAGS: readonly string[] = ["stop-bot"];

export const PHONE_OPTOUT_TAGS: readonly string[] = [
  "dnc",
  "do-not-contact",
  "dnc-sms",
  "stage:dnc",
  "dnc-voice",
  "suppress:dnc-reply",
  "suppress:dnc-voice",
];

export const EMAIL_OPTOUT_TAGS: readonly string[] = [
  "dnc",
  "do-not-contact",
  "dnc-email",
  "stage:dnc",
  "unsubscribed",
];

export const BOT_PAUSE_TAGS: readonly string[] = [
  "suppress-outbound",
  "hard-disqualified",
  "quarantined",
  "cooling-active",
];

export const BOT_ON_TAG = "agentic-active";

export const OUT_OF_AREA_TAGS: readonly string[] = ["out-of-area", "dq-out-of-area"];

/**
 * The tag changes the thread shows as quiet event lines (handoff 2026-10-06).
 * Only these are read from agent_actions, so the read stays one small query.
 */
export const THREAD_EVENT_TAGS: readonly string[] = [
  "out-of-area",
  "dq-out-of-area",
  "suppress-outbound",
  "stop-bot",
  "agentic-active",
  "dnc",
  "dnc-sms",
  "stage:dnc",
  "suppress:dnc-reply",
];

/** Opt-out tags among THREAD_EVENT_TAGS: any of them means texts and calls stopped. */
export const THREAD_OPTOUT_TAGS: readonly string[] = ["dnc", "dnc-sms", "stage:dnc", "suppress:dnc-reply"];

export function hasAny(tags: readonly string[], wanted: readonly string[]): boolean {
  const set = new Set(tags.map((t) => t.trim().toLowerCase()));
  return wanted.some((t) => set.has(t));
}
