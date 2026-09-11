"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { promptsApi } from "@/lib/mcp/prompts";
import type { PromptChange, PromptDraft, PromptRow } from "@/lib/mcp/prompts";

/**
 * Prompt editor — the dashboard's only write path for live bot prompts.
 *
 * The same two rules as lib/actions/botReview.ts, and they matter more here:
 *   1. This file NEVER imports a Supabase write client. Every write goes to LP
 *      MCP /api/bot-feedback/prompts/*, which re-checks the actor with the
 *      service role and writes bot_change_log. A shortcut to Supabase would
 *      skip both — and this table is read live on every generation, so an
 *      unlogged write is a change to what customers receive with no record of
 *      who made it.
 *   2. The gates below are re-checked server-side by LP MCP. Hiding a button is
 *      the courtesy; LP MCP is the gate. These exist to fail fast with a useful
 *      message, not to be the security boundary.
 */

export type PromptActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; field?: string };

function fail(error: string, field?: string): { ok: false; error: string; field?: string } {
  return field ? { ok: false, error, field } : { ok: false, error };
}

/** Operators and admins only — editing changes what customers are sent. */
async function requireEditor() {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false as const, error: "You are signed out." };
  if (ctx.role !== "operator" && !ctx.isAdmin) {
    return {
      ok: false as const,
      error:
        "Editing the live bot prompts is limited to operators — these changes reach customers on the next message.",
    };
  }
  return { ok: true as const, ctx };
}

/**
 * Save a draft. Nothing reaches customers.
 *
 * `fields` is a PARTIAL patch of only the columns the editor changed, matching
 * what LP MCP stores — sending the whole row would let a draft opened an hour
 * ago silently revert a field someone else changed since.
 */
export async function saveDraft(
  promptId: string,
  fields: Record<string, unknown>,
  note?: string | null,
): Promise<PromptActionResult<{ draft: PromptDraft; changes: PromptChange[] }>> {
  const gate = await requireEditor();
  if (!gate.ok) return fail(gate.error);

  const res = await promptsApi.saveDraft(gate.ctx.email, promptId, { fields, note: note ?? null });
  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return { ok: true, data: { draft: res.data.draft, changes: res.data.changes } };
}

export async function discardDraft(promptId: string): Promise<PromptActionResult> {
  const gate = await requireEditor();
  if (!gate.ok) return fail(gate.error);

  const res = await promptsApi.discardDraft(gate.ctx.email, promptId);
  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return { ok: true };
}

/**
 * Put the draft live.
 *
 * This is the one action here that changes what customers receive, and it takes
 * effect on the next generated message — there is no deploy step between this
 * returning and a real send. LP MCP validates the MERGED row, bumps the
 * version, and logs before/after so it can be rolled back.
 */
export async function activatePrompt(
  promptId: string,
  note?: string | null,
): Promise<PromptActionResult<{ prompt: PromptRow; version: number; changed: string[] }>> {
  const gate = await requireEditor();
  if (!gate.ok) return fail(gate.error);

  const res = await promptsApi.activate(gate.ctx.email, promptId, { note: note ?? null });
  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return { ok: true, data: res.data };
}

/** Restore the version recorded before one change-log entry. */
export async function rollbackPrompt(
  promptId: string,
  logId: number,
): Promise<PromptActionResult<{ prompt: PromptRow; version: number }>> {
  const gate = await requireEditor();
  if (!gate.ok) return fail(gate.error);

  const res = await promptsApi.rollback(gate.ctx.email, promptId, logId);
  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return { ok: true, data: res.data };
}

/** Turn a prompt on or off. Off is the kill switch and is never validated. */
export async function togglePrompt(
  promptId: string,
  active: boolean,
  reason?: string | null,
): Promise<PromptActionResult<{ prompt: PromptRow }>> {
  const gate = await requireEditor();
  if (!gate.ok) return fail(gate.error);

  const res = await promptsApi.toggle(gate.ctx.email, promptId, active, reason ?? null);
  if (!res.ok) return fail(res.error, res.field);

  revalidatePath("/bot-review");
  return { ok: true, data: res.data };
}
