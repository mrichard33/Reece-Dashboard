import { lpService } from "@/lib/supabase/lp";
import { fetchAllPages } from "@/lib/queries/fetchAllPages";
import type { Dispute, PayrollLine, PayrollRun } from "@/lib/payroll/core";

/**
 * Payroll reads for /payroll (staff) and /partner/payroll (partner).
 *
 * Service-role client, because every payroll table has RLS on with no
 * policies (LP-MCP sql/132, sql/133). That makes SCOPE this file's job: a
 * partner viewer is filtered to its own partner_id on EVERY query here, and
 * that id comes from the signed-in account (lib/auth getPartnerContext) —
 * never from a URL or a form. A run id from the URL is only honoured if it is
 * in the viewer's own run list (resolveRun), and lines and tickets are read by
 * that run / partner, so a guessed id from another partner returns nothing.
 *
 * Read-only. Every write goes through LP MCP (lib/actions/payroll.ts).
 */

export type PayrollScope = { kind: "partner"; partnerId: string } | { kind: "staff" };

export type RunWithPartner = PayrollRun & { partner_name: string | null };

export async function listRuns(scope: PayrollScope, limit = 26): Promise<RunWithPartner[]> {
  let q = lpService()
    .from("payroll_runs")
    .select("id, partner_id, period_start, period_end, mode, status, total_cents, lf_partners(display_name)")
    .eq("payee_type", "partner");
  if (scope.kind === "partner") q = q.eq("partner_id", scope.partnerId);
  // Newest week first; live before shadow for the same week.
  const { data, error } = await q
    .order("period_start", { ascending: false })
    .order("mode", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`payroll_runs: ${error.message}`);
  return (data ?? []).map((r) => {
    const { lf_partners, ...run } = r as unknown as PayrollRun & { lf_partners: { display_name: string | null } | null };
    return { ...run, partner_name: lf_partners?.display_name ?? null };
  });
}

export async function getLines(runId: string): Promise<PayrollLine[]> {
  return fetchAllPages<PayrollLine>("payroll.getLines", (from, to) =>
    lpService()
      .from("payroll_ledger")
      .select("id, run_id, lp_lead_id, campaign, agent_name, event_type, event_date, amount_cents, status, flag_reason")
      .eq("run_id", runId)
      .order("id")
      .range(from, to),
  );
}

export type LeadInfo = { name: string | null; source: string | null };

/** Customer name + LP source per lead id, for the table. Missing leads just show the id. */
export async function leadInfo(ids: string[]): Promise<Map<string, LeadInfo>> {
  const out = new Map<string, LeadInfo>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await lpService()
      .from("lp_leads")
      .select("lp_lead_id, first_name, last_name, lead_source")
      .in("lp_lead_id", chunk);
    if (error) throw new Error(`lp_leads: ${error.message}`);
    for (const l of data ?? []) {
      const name = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
      out.set(String(l.lp_lead_id), { name: name || null, source: l.lead_source ?? null });
    }
  }
  return out;
}

export async function listDisputes(scope: PayrollScope, limit = 300): Promise<Dispute[]> {
  let q = lpService().from("payroll_disputes").select("*");
  if (scope.kind === "partner") q = q.eq("partner_id", scope.partnerId);
  const { data, error } = await q.order("filed_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`payroll_disputes: ${error.message}`);
  return (data ?? []) as Dispute[];
}

/**
 * Whether this email may approve / deny tickets: an ACTIVE lf_report_approvers
 * row. The page uses it only to show the buttons; LP MCP payroll_decide_dispute
 * re-checks the same table before anything changes.
 */
export async function isPayrollApprover(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await lpService().from("lf_report_approvers").select("email").eq("active", true);
  if (error || !data) return false;
  return data.some((r) => String(r.email).toLowerCase() === email.toLowerCase());
}

/** True when the payroll tables are not there yet (LP-MCP sql/132 / sql/133 unapplied). */
export function isMissingTable(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /does not exist|Could not find the table|schema cache/i.test(m);
}
