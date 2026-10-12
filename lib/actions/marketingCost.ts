"use server";

import { getAccessContext } from "@/lib/auth";

/**
 * Apply a REECE_HOLD recommendation (handoff §7.5): a PERSON's click moves
 * held marketing spend onto the recommended market(s). Admin only. The work
 * is done by LP-MCP (`/n8n/admin/marketing-expenses/apply-recommendation`),
 * which rewrites the expense's eligible markets and reallocates; this action
 * only relays the click with the ingest signature the dashboard holds.
 */
export async function applyHoldRecommendation(expenseId: string, markets: string[]): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const base = (process.env.LP_MCP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "LP_MCP_URL is not set on the dashboard." };
  const list = markets.map((m) => m.trim()).filter((m) => /^[A-Z]{2,8}_MKT$/.test(m));
  if (!list.length) return { ok: false, error: "No market to apply." };
  try {
    const res = await fetch(`${base}/n8n/admin/marketing-expenses/apply-recommendation`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LP_WEBHOOK_SIGNATURE ? { "x-ghl-signature": process.env.LP_WEBHOOK_SIGNATURE } : {}),
      },
      body: JSON.stringify({ expense_id: expenseId, markets: list, by: ctx.email }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; ok?: boolean; error?: string };
    if (!res.ok || body.success === false || body.ok === false) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}
