"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth";
import { lpService } from "@/lib/supabase/lp";
import { shapeInvoiceDetail, invoiceEditDefaults, type InvoiceDetail, type InvoiceEditForm, type InvoiceEditRow, type InvoiceAllocationRaw } from "@/lib/queries/marketingCost.core";

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

/**
 * The invoice view (2026-10-19): the lines of one invoice, the offices each was
 * charged to, what is disputed and what was credited. Anyone who can open
 * /marketing-spend may look; only an admin may change it (settleInvoiceDispute).
 */
export type InvoiceStage = { in_review: boolean; decided: boolean; status: string };

export async function loadInvoiceDetail(documentId: string): Promise<
  { ok: true; detail: InvoiceDetail; form: InvoiceEditForm; vendors: { id: string; name: string }[]; stage: InvoiceStage } | { ok: false; error: string }
> {
  const ctx = await getAccessContext();
  if (!ctx) return { ok: false, error: "Sign in again." };
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: "Bad invoice id." };
  const sb = lpService();
  const [doc, rows, vendors] = await Promise.all([
    sb.from("marketing_invoice_documents").select("analysis, status").eq("id", documentId).maybeSingle(),
    sb.from("marketing_expenses")
      .select("id, line_no, description, amount, status, flags, period_start, period_end, vendor_id, invoice_number, lp_sub_sources, eligible_markets")
      .eq("document_id", documentId).order("line_no"),
    sb.from("marketing_vendors").select("id, vendor_name").eq("is_active", true).order("vendor_name"),
  ]);
  if (doc.error || rows.error) return { ok: false, error: (doc.error ?? rows.error)!.message };
  const lines = (rows.data ?? []) as InvoiceEditRow[];
  const allocs = lines.length
    ? await sb.from("marketing_expense_allocations").select("expense_id, month, market, amount").in("expense_id", lines.map((l) => l.id))
    : { data: [], error: null };
  if (allocs.error) return { ok: false, error: allocs.error.message };
  const live = lines.filter((l) => l.status !== "superseded");
  return {
    ok: true,
    detail: shapeInvoiceDetail(lines, (allocs.data ?? []) as InvoiceAllocationRaw[], (doc.data?.analysis ?? null) as Parameters<typeof shapeInvoiceDetail>[2]),
    form: invoiceEditDefaults(lines),
    vendors: ((vendors.data ?? []) as { id: string; vendor_name: string }[]).map((v) => ({ id: v.id, name: v.vendor_name })),
    stage: {
      status: String(doc.data?.status ?? ""),
      in_review: live.some((l) => l.status === "pending_review"),
      decided: live.some((l) => l.status === "approved" || l.status === "rejected"),
    },
  };
}

/**
 * Confirm the disputed charge, record or change the credit received, or reopen
 * the dispute (the user, 2026-10-19). Admin only. LP-MCP does the work
 * (`/n8n/admin/marketing-invoices/dispute`, settleDispute): it re-splits the
 * lines, records who did it, and redraws the Slack card so both agree.
 */
export async function settleInvoiceDispute(
  documentId: string,
  action: "accept" | "credit" | "reopen",
  amount?: number | null,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const base = (process.env.LP_MCP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "LP_MCP_URL is not set on the dashboard." };
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: "Bad invoice id." };
  if (!["accept", "credit", "reopen"].includes(action)) return { ok: false, error: "Unknown action." };
  if (action === "credit" && amount != null && !(Number.isFinite(amount) && amount > 0)) return { ok: false, error: "Enter a credit above $0." };
  try {
    const res = await fetch(`${base}/n8n/admin/marketing-invoices/dispute`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LP_WEBHOOK_SIGNATURE ? { "x-ghl-signature": process.env.LP_WEBHOOK_SIGNATURE } : {}),
      },
      body: JSON.stringify({ document_id: documentId, action, amount: action === "credit" ? amount ?? null : null, by: ctx.email }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
    if (!res.ok || body.success === false) return { ok: false, error: body.error ?? body.message ?? `HTTP ${res.status}` };
    revalidatePath("/marketing-spend");
    return { ok: true, message: body.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}

/**
 * Approve, reject, reopen or edit an invoice from the invoice view (the user,
 * 2026-10-19: "View and Edit … doesn't allow any edits"). Admin only (Mark,
 * Brad), the same people who decide in Slack. LP-MCP runs the Slack card's own
 * handler (`/n8n/admin/marketing-invoices/decide`), so the rules and blockers
 * are the same, and the Slack card is redrawn to match.
 */
export async function decideInvoice(
  documentId: string,
  action: "approve" | "reject" | "reopen" | "edit",
  edit?: Partial<Omit<InvoiceEditForm, "one_line">> | null,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const ctx = await getAccessContext();
  if (!ctx?.isAdmin) return { ok: false, error: "Admin only." };
  const base = (process.env.LP_MCP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "LP_MCP_URL is not set on the dashboard." };
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return { ok: false, error: "Bad invoice id." };
  if (!["approve", "reject", "reopen", "edit"].includes(action)) return { ok: false, error: "Unknown action." };
  try {
    const res = await fetch(`${base}/n8n/admin/marketing-invoices/decide`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LP_WEBHOOK_SIGNATURE ? { "x-ghl-signature": process.env.LP_WEBHOOK_SIGNATURE } : {}),
      },
      body: JSON.stringify({ document_id: documentId, action, edit: action === "edit" ? edit ?? {} : null, by: ctx.email }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
    if (!res.ok || body.success === false) return { ok: false, error: body.error ?? body.message ?? `HTTP ${res.status}` };
    revalidatePath("/marketing-spend");
    return { ok: true, message: body.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}
