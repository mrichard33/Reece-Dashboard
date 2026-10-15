"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { lpMcp } from "@/lib/mcp/lpClient";
import { McpError } from "@/lib/mcp/client";

/**
 * Incident actions and "run check now" — the dashboard's only write path for
 * System Health (LP-MCP, 2026-10-15).
 *
 *   1. This file NEVER imports a Supabase write client. Every action goes to
 *      LP MCP (incident_action / health_run_check), which applies the move,
 *      refuses an illegal one and writes the incident_events row naming the
 *      person. The same module serves the Slack buttons and the /ops routes.
 *   2. Operators only, enforced HERE as well as in the UI. The actor is the
 *      signed-in operator's email, never a value from the form.
 */

export type ActionResult = { ok: boolean; error?: string; message?: string };

async function operator(): Promise<{ email: string } | { error: string }> {
  const ctx = await getAccessContext();
  if (!ctx) return { error: "Not signed in." };
  if (ctx.role !== "operator") return { error: "Only Reece operators can act on incidents." };
  return { email: ctx.email };
}

function refresh(id?: number) {
  revalidatePath("/incidents");
  revalidatePath("/system-health");
  if (id) revalidatePath(`/incidents/${id}`);
}

const fail = (e: unknown): ActionResult => ({
  ok: false,
  error: e instanceof McpError ? `LP MCP: ${e.message}` : e instanceof Error ? e.message : String(e),
});

export async function incidentAct(input: {
  id: number;
  action: "ack" | "snooze" | "close" | "run";
  reason?: string;
  minutes?: number;
}): Promise<ActionResult> {
  const who = await operator();
  if ("error" in who) return { ok: false, error: who.error };
  if (!Number.isInteger(input.id) || input.id <= 0) return { ok: false, error: "Unknown incident." };
  const reason = (input.reason ?? "").trim();
  if ((input.action === "snooze" || input.action === "close") && !reason) {
    return { ok: false, error: input.action === "snooze" ? "Say why you are snoozing it." : "Say why no action is needed." };
  }
  try {
    const res = await lpMcp.incidentAction({
      action: input.action,
      incident_id: input.id,
      actor: who.email,
      ...(reason ? { reason } : {}),
      ...(input.action === "snooze" ? { minutes: input.minutes && input.minutes > 0 ? input.minutes : 120 } : {}),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Nothing changed." };
    refresh(input.id);
    const done: Record<string, string> = {
      ack: "Acknowledged.",
      snooze: `Snoozed for ${Math.round((input.minutes ?? 120) / 60 * 10) / 10}h.`,
      close: "Closed with no action. This problem stays quiet for 7 days.",
      run: "Check ran. The result is on the check's page.",
    };
    return { ok: true, message: done[input.action] };
  } catch (e) {
    return fail(e);
  }
}

/** Run one check now ("all" runs every check that can run on demand). */
export async function runCheckNow(checkId: string): Promise<ActionResult> {
  const who = await operator();
  if ("error" in who) return { ok: false, error: who.error };
  if (!/^[a-z0-9_.]+$|^all$/.test(checkId)) return { ok: false, error: "Unknown check." };
  try {
    const res = await lpMcp.healthRunCheck({ check_id: checkId, actor: who.email });
    if (!res.ok) return { ok: false, error: res.error ?? "The check did not run." };
    refresh();
    if (checkId !== "all") revalidatePath(`/system-health/${checkId}`);
    return { ok: true, message: checkId === "all" ? "Every on-demand check ran." : "Check ran." };
  } catch (e) {
    return fail(e);
  }
}
