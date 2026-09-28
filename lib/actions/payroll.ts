"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext, getPartnerContext } from "@/lib/auth";
import { lpMcp } from "@/lib/mcp/lpClient";
import { McpError } from "@/lib/mcp/client";
import { isPayrollApprover } from "@/lib/queries/payroll";
import { validateDecisionForm, validateDisputeForm, type DisputeForm } from "@/lib/payroll/core";

/**
 * Payroll dispute tickets — the dashboard's only payroll write path.
 *
 * Two rules, the same two the Command Center keeps (lib/actions/commandCenter.ts):
 *   1. This file NEVER imports a Supabase write client. Filing and deciding go
 *      to LP MCP (payroll_file_dispute / payroll_decide_dispute), which owns the
 *      money rules, re-checks scoping and approvers, and writes the audit row.
 *   2. Who may act is enforced HERE as well as in the UI:
 *        file   → a signed-in PARTNER; the partner_id sent is the account's own,
 *                 never one from the form.
 *        decide → a staff operator whose email is an ACTIVE lf_report_approvers row.
 *      Hiding a button is a courtesy; these checks are the gate on this side,
 *      and LP MCP checks again on its side.
 */

export type ActionResult = { ok: boolean; error?: string; message?: string };

function refresh() {
  revalidatePath("/payroll");
  revalidatePath("/partner/payroll");
}

function describe(e: unknown): string {
  if (e instanceof McpError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export async function fileDispute(form: DisputeForm): Promise<ActionResult> {
  const partner = await getPartnerContext();
  if (!partner) return { ok: false, error: "Only a partner account can file a payroll ticket." };

  const invalid = validateDisputeForm(form);
  if (invalid) return { ok: false, error: invalid };

  try {
    const res = await lpMcp.payrollFileDispute({
      partner_id: partner.partnerId,
      filed_by_email: partner.email,
      ...(form.ledgerId
        ? { ledger_id: form.ledgerId }
        : { lp_lead_id: form.lpLeadId?.trim(), event_type: form.eventType, event_date: form.eventDate }),
      ...(form.claimedAmount?.trim() ? { claimed_amount: form.claimedAmount.trim() } : {}),
      reason: form.reason.trim(),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "The ticket was not filed." };
    refresh();
    const id = (res.dispute as { id?: number } | undefined)?.id;
    return { ok: true, message: id ? `Ticket #${id} filed. Reece will review it.` : "Ticket filed." };
  } catch (e) {
    return { ok: false, error: `Could not reach payroll — nothing was filed. (${describe(e)})` };
  }
}

export async function decideDispute(input: {
  disputeId: number;
  decision: "approve" | "deny";
  note: string;
  approvedAmount: string;
}): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx || ctx.role !== "operator") return { ok: false, error: "Only Reece operators can decide payroll tickets." };
  if (!(await isPayrollApprover(ctx.email))) {
    return { ok: false, error: "You are not an active payroll approver (lf_report_approvers)." };
  }
  if (!Number.isInteger(input.disputeId) || input.disputeId <= 0) return { ok: false, error: "Unknown ticket." };
  const invalid = validateDecisionForm(input.decision, input.note, input.approvedAmount);
  if (invalid) return { ok: false, error: invalid };

  try {
    const res = await lpMcp.payrollDecideDispute({
      dispute_id: input.disputeId,
      decision: input.decision,
      decided_by_email: ctx.email,
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
      ...(input.decision === "approve" && input.approvedAmount.trim() ? { approved_amount: input.approvedAmount.trim() } : {}),
    });
    if (!res.ok) return { ok: false, error: res.error ?? "Nothing changed." };
    refresh();
    if (input.decision === "deny") return { ok: true, message: `Ticket #${input.disputeId} denied.` };
    return {
      ok: true,
      message: res.waitsForNextRun
        ? `Ticket #${input.disputeId} approved — it will be added to the next weekly run.`
        : `Ticket #${input.disputeId} approved — the line was updated.`,
    };
  } catch (e) {
    return { ok: false, error: `Could not reach payroll — nothing changed. (${describe(e)})` };
  }
}
