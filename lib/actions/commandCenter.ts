"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { lpMcp, type RuleResult } from "@/lib/mcp/lpClient";
import { McpError } from "@/lib/mcp/client";

/**
 * The Command Center's only write path.
 *
 * Two rules hold this whole surface together:
 *   1. This file NEVER imports a Supabase write client. Every ruling goes to LP
 *      MCP memory_rule, which is the one door that writes decisions, closes the
 *      card and leaves the audit row — all in one transaction. A shortcut
 *      straight to Supabase would skip the log and the stale guard.
 *   2. Ruling is admin only, and that is enforced HERE as well as in the UI.
 *      Hiding the buttons is a courtesy; this check is the actual gate.
 */

export type RuleInput = {
  action: string;
  target?: { table: string; id: number };
  card_version?: string | null;
  text?: string;
  option_key?: string;
  category?: string;
  reason?: string;
  snooze_until?: string;
  stage?: "built" | "verified" | "no_build";
  proof?: string;
  /** assign (sql/112): who now owns the to-do. */
  assignee?: string;
  build?: { description: string };
  supersedes_id?: number;
  same_as_id?: number;
  reverses_id?: number;
};

/**
 * Apply one ruling. Returns memory_rule's own result shape so the page can act
 * on a guard_conflict or a stale_card specifically, rather than showing one
 * generic failure for everything.
 */
export type BatchInput = {
  action: "batch_apply";
  verdict: string;
  rec_group_key?: string;
  reason?: string;
  assignee?: string;
  targets: { table: string; id: number; card_version: string | null; proof?: string }[];
};

export async function rule(input: RuleInput): Promise<RuleResult> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, code: "not_admin", message: "Not signed in." };
  if (ctx.role !== "operator") return { ok: false, code: "not_admin", message: "Operators only." };
  if (!ctx.isAdmin) {
    return { ok: false, code: "not_admin", message: "Read-only — ruling is admin only." };
  }

  let res: RuleResult;
  try {
    res = await lpMcp.rule({
      ...stripUndefined(input),
      // The audit row records the person, never the browser session.
      ruled_by: ctx.email,
    });
  } catch (err) {
    // A transport failure is not a ruling that half-happened: claude_rule_apply
    // is one transaction, so nothing was written. Say so plainly.
    if (err instanceof McpError) {
      return { ok: false, code: "error", message: `Could not reach LP MCP (${err.kind}). Nothing was changed.` };
    }
    return { ok: false, code: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) revalidatePath("/command-center");
  return res;
}

/** Re-run the recommendation for one card. Same admin gate. */
export async function recheck(table: string, id: number): Promise<RuleResult> {
  return rule({ action: "recheck", target: { table, id } });
}

/**
 * A batch pass: one verdict, up to 50 cards, one transaction, one batch_id.
 *
 * Admin-only, checked HERE as well as in the UI — and it matters more here than
 * on a single card, because this is the one button that can change fifty rows.
 * Everything it refuses (over 50, a Rulings card, anything below high
 * confidence, a proof-less `fixed`, a card edited since the screen loaded) is
 * refused again by claude_rule_batch; the page agreeing with it just means the
 * person finds out before they have checked fifty boxes.
 */
export async function ruleBatch(input: BatchInput): Promise<RuleResult> {
  const gate = await adminOnly();
  if (gate) return gate;
  const ctx = await getAccessContext();
  return send({ ...input, ruled_by: ctx!.email });
}

/**
 * Take a whole pass back. Reason is required — an undo is a ruling too, and the
 * history should say why rather than just that it happened.
 */
export async function ruleBatchUndo(batchId: string, reason: string): Promise<RuleResult> {
  const gate = await adminOnly();
  if (gate) return gate;
  const ctx = await getAccessContext();
  if (!String(reason ?? "").trim()) {
    return { ok: false, code: "reason_required", message: "Say why this pass is being reversed." };
  }
  return send({ action: "batch_undo", batch_id: batchId, reason: reason.trim(), ruled_by: ctx!.email });
}

/** The gate, once, so every action here fails the same way. */
async function adminOnly(): Promise<RuleResult | null> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, code: "not_admin", message: "Not signed in." };
  if (ctx.role !== "operator") return { ok: false, code: "not_admin", message: "Operators only." };
  if (!ctx.isAdmin) return { ok: false, code: "not_admin", message: "Read-only — ruling is admin only." };
  return null;
}

/** One place that talks to LP MCP, so failures read the same everywhere. */
async function send(args: Record<string, unknown>): Promise<RuleResult> {
  let res: RuleResult;
  try {
    res = await lpMcp.ruleBatch(stripUndefined(args));
  } catch (err) {
    if (err instanceof McpError) {
      return { ok: false, code: "error", message: `Could not reach LP MCP (${err.kind}). Nothing was changed.` };
    }
    return { ok: false, code: "error", message: err instanceof Error ? err.message : String(err) };
  }
  if (res.ok) revalidatePath("/command-center");
  return res;
}

/** Drop keys the tool would otherwise see as explicitly-null arguments. */
function stripUndefined(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}
