"use server";

import { revalidatePath } from "next/cache";
import { lpService } from "@/lib/supabase/lp";
import { getAccessContext } from "@/lib/auth";
import { isFrequency, parseEmails, parseSubSources } from "@/lib/queries/vendorReports.core";

export type ActionResult = { ok: boolean; error?: string; code?: "not_operator" | "not_admin" | "invalid" | "db" };

/**
 * Edits to `vdr_vendor_config` (2026-10-14). The n8n "06 VDR" workflow reads
 * the table when the LP feed email lands, so a save here changes the next run.
 *
 * Any operator may edit emails, CC, sub-sources, rev share, frequency and
 * on/off, and add or delete a vendor. Dry run is RETIRED from this page (Mark,
 * 2026-10-14: "we will not use it"): every save writes dry_run=false, so a
 * vendor that is on sends to its vendor emails. The column stays in the table
 * for the workflow's history.
 */

type SaveInput = {
  id: number;
  recipients_to: string; // as typed; parsed here
  recipients_cc: string;
  /** Hidden copies as typed. Omitted = unchanged. Mark always gets one whatever this holds (the workflow adds him). */
  recipients_bcc?: string;
  rev_share: boolean;
  is_active: boolean;
  /** LP sub-sources as typed (comma or new line). Omitted = unchanged. Mark, 2026-10-14: editable on the page. */
  lp_sub_sources?: string;
  /** weekly (Mondays) or monthly (the 1st). Omitted = unchanged. Mark, 2026-10-14. */
  frequency?: string;
};

export async function saveVendorReport(input: SaveInput): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx || ctx.role !== "operator") return { ok: false, code: "not_operator", error: "Operators only." };
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, code: "invalid", error: "Bad vendor id." };

  const to = parseEmails(input.recipients_to);
  const cc = parseEmails(input.recipients_cc);
  const bcc = input.recipients_bcc === undefined ? null : parseEmails(input.recipients_bcc);
  const bad = [...to.invalid, ...cc.invalid, ...(bcc ? bcc.invalid : [])];
  if (bad.length) return { ok: false, code: "invalid", error: `Not an email address: ${bad.join(", ")}` };
  // A vendor with no sub-source would match no lead: the run would say "no leads" every week and nobody would notice.
  const subs = input.lp_sub_sources === undefined ? null : parseSubSources(input.lp_sub_sources);
  if (subs && subs.length === 0) return { ok: false, code: "invalid", error: "At least one LP sub-source is required (LP's exact Sub-Source name)." };
  if (input.frequency !== undefined && !isFrequency(input.frequency)) return { ok: false, code: "invalid", error: "Frequency must be weekly or monthly." };

  const sb = lpService();
  const { data: cur, error: readErr } = await sb
    .from("vdr_vendor_config")
    .select("id, dry_run, is_active, notes")
    .eq("id", id)
    .maybeSingle<{ id: number; dry_run: boolean; is_active: boolean; notes: string | null }>();
  if (readErr) return { ok: false, code: "db", error: readErr.message };
  if (!cur) return { ok: false, code: "invalid", error: "Vendor not found." };

  if (Boolean(input.is_active) && to.emails.length === 0) {
    return { ok: false, code: "invalid", error: "A vendor that is on needs at least one To email, or its run blocks. Add the email first." };
  }

  const stamp = `${ctx.executive?.name ?? ctx.email} ${new Date().toISOString().slice(0, 10)}`;
  const { error } = await sb
    .from("vdr_vendor_config")
    .update({
      recipients_to: to.emails,
      recipients_cc: cc.emails,
      ...(bcc ? { recipients_bcc: bcc.emails } : {}),
      rev_share: Boolean(input.rev_share),
      is_active: Boolean(input.is_active),
      dry_run: false,
      ...(subs ? { lp_sub_sources: subs } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      // A row that was still in dry run records who retired it, after any existing note.
      ...(cur.dry_run ? { notes: [cur.notes, `dry_run=false by ${stamp} (dry run retired)`].filter(Boolean).join(" | ") } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, code: "db", error: error.message };

  revalidatePath("/vendor-reports");
  return { ok: true };
}

/**
 * Remove a vendor row (Mark, 2026-10-14: "I should be able to delete vendors").
 * The send log and the payable-jobs ledger reference the row with ON DELETE SET
 * NULL and carry vendor_name themselves, so the history of what was sent stays.
 * Deleting is the one way to make a sub-source show up again as "no vendor" in
 * Mark's weekly summary; turning a vendor off keeps it mapped and silent.
 */
export async function deleteVendorReport(input: { id: number }): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx || ctx.role !== "operator") return { ok: false, code: "not_operator", error: "Operators only." };
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, code: "invalid", error: "Bad vendor id." };

  const sb = lpService();
  const { data: cur, error: readErr } = await sb
    .from("vdr_vendor_config")
    .select("id, vendor_name")
    .eq("id", id)
    .maybeSingle<{ id: number; vendor_name: string }>();
  if (readErr) return { ok: false, code: "db", error: readErr.message };
  if (!cur) return { ok: false, code: "invalid", error: "Vendor not found." };

  const { error } = await sb.from("vdr_vendor_config").delete().eq("id", id);
  if (error) return { ok: false, code: "db", error: error.message };

  revalidatePath("/vendor-reports");
  return { ok: true };
}

type AddInput = {
  vendor_name: string;
  lp_sub_sources: string; // comma or newline separated, LP's exact SourceSubDescr values
  recipients_to: string;
  rev_share: boolean;
  is_active: boolean;
  /** weekly (default) or monthly. */
  frequency?: string;
};

/**
 * New vendors start switched OFF: a person adds the email, then turns it on.
 * (They used to start in dry run; dry run is retired, Mark 2026-10-14.)
 */
export async function addVendorReport(input: AddInput): Promise<ActionResult> {
  const ctx = await getAccessContext();
  if (!ctx || ctx.role !== "operator") return { ok: false, code: "not_operator", error: "Operators only." };

  const name = String(input.vendor_name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, code: "invalid", error: "Vendor name is required." };
  const subs = parseSubSources(input.lp_sub_sources);
  if (subs.length === 0) return { ok: false, code: "invalid", error: "At least one LP sub-source is required (LP's exact Sub-Source name)." };
  const to = parseEmails(input.recipients_to);
  if (to.invalid.length) return { ok: false, code: "invalid", error: `Not an email address: ${to.invalid.join(", ")}` };
  const frequency = input.frequency === undefined ? "weekly" : input.frequency;
  if (!isFrequency(frequency)) return { ok: false, code: "invalid", error: "Frequency must be weekly or monthly." };
  if (Boolean(input.is_active) && to.emails.length === 0) return { ok: false, code: "invalid", error: "A vendor that is on needs at least one To email." };

  const { error } = await lpService().from("vdr_vendor_config").insert({
    vendor_name: name,
    lp_sub_sources: subs,
    recipients_to: to.emails,
    recipients_cc: [],
    recipients_bcc: [],
    rev_share: Boolean(input.rev_share),
    is_active: Boolean(input.is_active),
    dry_run: false,
    frequency,
    notes: `Added in the dashboard by ${ctx.executive?.name ?? ctx.email} ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, code: "invalid", error: `A vendor named "${name}" already exists.` };
    return { ok: false, code: "db", error: error.message };
  }

  revalidatePath("/vendor-reports");
  return { ok: true };
}
