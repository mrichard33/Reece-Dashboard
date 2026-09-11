"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { botFeedbackApi, type BotFeedbackResult } from "@/lib/mcp/botFeedback";
import {
  validateDraft,
  effectiveRewrite,
  canReview,
  canStopBot,
  type FeedbackDraft,
  type MessageType,
} from "@/lib/botReview/core";

/**
 * Bot Review's only write path.
 *
 * Two rules, the same two the Command Center's actions file holds to:
 *   1. This file NEVER imports a Supabase write client. Every write goes to LP
 *      MCP /api/bot-feedback/*, which is the one door that re-checks the
 *      actor's permissions with the service role, writes bot_change_log, and
 *      fires the Unsafe alert. A shortcut to Supabase would skip all three.
 *   2. The gates below are re-checked server-side by LP MCP. Hiding a button is
 *      the courtesy; LP MCP is the gate. These checks exist to fail fast with a
 *      useful message, not to be the security boundary.
 */

export type ActionResult =
  | { ok: true; data: { id: number; counts: boolean; uncalibrated: boolean; contextId: number } }
  | { ok: false; error: string; field?: string };

function fail(error: string, field?: string): ActionResult {
  return field ? { ok: false, error, field } : { ok: false, error };
}

/** Submit one review. Returns the new id so the UI can offer Undo. */
export async function submitFeedback(input: {
  messageType: MessageType;
  messageRef: string;
  originalText: string | null;
  draft: FeedbackDraft;
  isCalibration?: boolean;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx) return fail("You are signed out.");
  if (!canReview(ctx)) return fail("You do not have access to review bot messages.");

  const invalid = validateDraft(input.draft);
  if (invalid) return fail(invalid.message, invalid.field);

  const res = await botFeedbackApi.submit(ctx.email, {
    message_type: input.messageType,
    message_ref: input.messageRef,
    verdict: input.draft.verdict as string,
    reason_codes: input.draft.reasonCodes,
    // A rewrite identical to the bot's own text is not a correction — see
    // effectiveRewrite. Sending it would poison the Phase 2 example library.
    better_text: effectiveRewrite(input.draft.betterText, input.originalText),
    note: input.draft.note.trim() || null,
    seen_before: input.draft.seenBefore,
    gold: input.draft.gold,
    is_calibration: input.isCalibration === true,
  });

  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return {
    ok: true,
    data: {
      id: res.data.id,
      counts: res.data.counts,
      uncalibrated: res.data.uncalibrated,
      contextId: res.data.context_id,
    },
  };
}

/**
 * Undo a review inside the 10-second window.
 *
 * The window itself is enforced by a DB trigger, not here — this action does
 * not even know how long it has been. That is deliberate: a clock the client
 * could influence is not a guarantee.
 */
export async function undoFeedback(id: number): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, error: "You are signed out." };

  const res = await botFeedbackApi.undo(ctx.email, id);
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/bot-review");
  return { ok: true };
}

/** Edit a review. LP MCP inserts a superseding row; nothing is updated. */
export async function editFeedback(input: {
  id: number;
  originalText: string | null;
  draft: FeedbackDraft;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx) return fail("You are signed out.");
  if (!canReview(ctx)) return fail("You do not have access to review bot messages.");

  const invalid = validateDraft(input.draft);
  if (invalid) return fail(invalid.message, invalid.field);

  const res = await botFeedbackApi.edit(ctx.email, input.id, {
    verdict: input.draft.verdict as string,
    reason_codes: input.draft.reasonCodes,
    better_text: effectiveRewrite(input.draft.betterText, input.originalText),
    note: input.draft.note.trim() || null,
    seen_before: input.draft.seenBefore,
    gold: input.draft.gold,
  });

  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return {
    ok: true,
    data: {
      id: res.data.id,
      counts: res.data.counts,
      uncalibrated: res.data.uncalibrated,
      contextId: res.data.context_id,
    },
  };
}

/**
 * Stop the bot for one lead.
 *
 * This queues the existing Action Executor add_tag action — the dashboard never
 * calls GHL (§1.4). Idempotent: a lead already carrying stop-bot comes back
 * `alreadyStopped` rather than queueing a second tag.
 */
export async function stopBotForLead(
  contactId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string; alreadyStopped?: boolean; actionId?: number | null }> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, error: "You are signed out." };
  if (!canStopBot(ctx)) return { ok: false, error: "Stopping the bot is for operators and admins." };

  const res: BotFeedbackResult<{ action_id: number | null; already_stopped: boolean }> =
    await botFeedbackApi.stopBot(ctx.email, contactId, reason);

  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/bot-review");
  return { ok: true, alreadyStopped: res.data.already_stopped, actionId: res.data.action_id };
}
