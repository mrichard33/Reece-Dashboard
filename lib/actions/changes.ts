"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { lpService } from "@/lib/supabase/lp";
import { buildPrompt, type ChangeLane, type ChangeRepo } from "@/lib/changes/buildPrompt";
import { getPromptInput } from "@/lib/queries/changes";

/**
 * Command Center — the Changes lane's only write path.
 *
 * Two rules, both borrowed from surfaces that already work:
 *
 * 1. NOTHING WRITES `status`. Migration 0020's BEFORE trigger derives it from
 *    the facts written here (approved_at, pr_number, ci_conclusion, merged_at).
 *    Setting it directly is not just redundant, it is silently discarded — which
 *    is exactly what keeps the badge honest. Same discipline as
 *    fb_sync_post_status() and lib/actions/content.ts.
 *
 * 2. Ruling is admin only, enforced HERE as well as in the UI. Hiding a button
 *    is a courtesy; this check is the gate. Copied from
 *    lib/actions/commandCenter.ts, which says the same thing.
 *
 * Unlike commandCenter.ts these writes go straight to Supabase rather than
 * through LP MCP. That is deliberate: memory_rule exists to protect MEMORY — the
 * decision log and its audit row. claude_changes is an implementation record, and
 * the content engine writes its own state the same way.
 */

export type ChangeResult = { ok: boolean; error?: string; prompt?: string };

async function admin() {
  const ctx = await getAccessContext();
  if (!ctx) return { ctx: null, err: "Not signed in." };
  if (ctx.role !== "operator") return { ctx: null, err: "Operators only." };
  if (!ctx.isAdmin) return { ctx: null, err: "Read-only — changes are admin only." };
  return { ctx, err: null };
}

function refresh() {
  revalidatePath("/command-center");
}

/** Append one row to the audit trail. Best effort: never the reason a write fails. */
async function log(
  sb: ReturnType<typeof lpService>,
  changeId: number,
  actor: string,
  action: string,
  extra: { from?: string | null; to?: string | null; reason?: string | null; prompt?: string | null } = {},
) {
  try {
    await sb.from("claude_changes_log").insert({
      change_id: changeId, actor, action,
      from_status: extra.from ?? null, to_status: extra.to ?? null,
      reason: extra.reason ?? null, prompt_snapshot: extra.prompt ?? null,
    });
  } catch { /* the log is best effort — never the reason a change fails to move */ }
}

/**
 * Set which kind of change this is, and which repo.
 *
 * The backfill guessed the lane from the item's own words, so this is the
 * correction path — and the prompt cannot be generated until it is right,
 * because the three lanes produce incompatible work.
 */
export async function setLane(
  id: number,
  lane: ChangeLane,
  repo: ChangeRepo | null,
): Promise<ChangeResult> {
  const { ctx, err } = await admin();
  if (!ctx) return { ok: false, error: err! };

  const sb = lpService();
  // A lane change invalidates the prompt built for the old one — leaving it
  // would hand someone a GHL guide for a code change.
  const { error } = await sb
    .from("claude_changes")
    .update({ lane, repo: lane === "code" ? repo : null, prompt_text: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await log(sb, id, ctx.email, "edited", { reason: `lane → ${lane}${repo ? ` (${repo})` : ""}` });
  refresh();
  return { ok: true };
}

/**
 * Build the prompt and store it. Returns it too, so the button can put it on the
 * clipboard without a second round-trip.
 */
export async function generatePrompt(id: number): Promise<ChangeResult> {
  const { ctx, err } = await admin();
  if (!ctx) return { ok: false, error: err! };

  const input = await getPromptInput(id);
  if (!input) return { ok: false, error: "That change no longer exists." };

  let prompt: string;
  try {
    prompt = buildPrompt(input);
  } catch (e) {
    // The one expected failure: no lane set. buildPrompt refuses rather than
    // guessing, and its message is already written for a person.
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const sb = lpService();
  const { data: before } = await sb.from("claude_changes").select("prompt_version").eq("id", id).maybeSingle();
  const version = (before?.prompt_version ?? 0) + 1;

  const { error } = await sb
    .from("claude_changes")
    .update({ prompt_text: prompt, prompt_version: version })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await log(sb, id, ctx.email, "generated", { reason: `v${version}`, prompt });
  refresh();
  return { ok: true, prompt };
}

/** Approve the proposed change. The trigger moves it to `approved`. */
export async function approveChange(id: number): Promise<ChangeResult> {
  const { ctx, err } = await admin();
  if (!ctx) return { ok: false, error: err! };

  const sb = lpService();
  const { error } = await sb
    .from("claude_changes")
    .update({ approved_at: new Date().toISOString(), approved_by: ctx.email, rejected_at: null, rejected_by: null, reject_reason: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await log(sb, id, ctx.email, "approved", { to: "approved" });
  refresh();
  return { ok: true };
}

/** Reject it. A reason is required — a rejection with no why teaches nothing. */
export async function rejectChange(id: number, reason: string): Promise<ChangeResult> {
  const { ctx, err } = await admin();
  if (!ctx) return { ok: false, error: err! };
  const why = String(reason ?? "").trim();
  if (!why) return { ok: false, error: "Say why before rejecting this one." };

  const sb = lpService();
  const { error } = await sb
    .from("claude_changes")
    .update({ rejected_at: new Date().toISOString(), rejected_by: ctx.email, reject_reason: why })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await log(sb, id, ctx.email, "rejected", { to: "rejected", reason: why });
  refresh();
  return { ok: true };
}

/**
 * Record the PR this change became.
 *
 * Manual for now — Phase 3 detects it from the `Change #<id>` marker the prompt
 * asks for. Accepts a full URL or a bare number, because both are what is
 * actually to hand when you have just opened a PR.
 */
export async function linkPr(id: number, prRef: string): Promise<ChangeResult> {
  const { ctx, err } = await admin();
  if (!ctx) return { ok: false, error: err! };

  const raw = String(prRef ?? "").trim();
  const num = Number(raw.match(/(?:\/pull\/|#)?(\d+)\s*$/)?.[1]);
  if (!Number.isFinite(num) || num <= 0) {
    return { ok: false, error: "Paste the PR link or its number." };
  }
  const url = raw.startsWith("http") ? raw : null;

  const sb = lpService();
  const { error } = await sb.from("claude_changes").update({ pr_number: num, pr_url: url }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await log(sb, id, ctx.email, "pr_linked", { reason: url ?? `#${num}` });
  refresh();
  return { ok: true };
}
