/**
 * Payroll page — pure helpers shared by the page, the queries and the actions.
 *
 * Pure so they unit-test without a DB, a session or a render (the bot-review
 * pattern). LP MCP is the gate for every write — its payroll_file_dispute and
 * payroll_decide_dispute tools re-check scoping, approvers and amounts. This
 * copy only lets the page show an error before a round trip. If the two ever
 * disagree, LP MCP (src/payroll/disputes.js) wins and this file is the bug.
 */

// ─── Tabs: one per pay program (ruled 2026-09-27: "campaign" = pay program) ──

export const PROGRAM_TABS = [
  { key: "canvass", label: "Canvass confirmations", rate: "$15", eventType: "canvass_confirmed_appt" },
  { key: "demos", label: "Aged demos", rate: "$250", eventType: "completed_demo" },
  { key: "direct", label: "Direct", rate: "1.5%", eventType: "direct_job_net" },
  { key: "adjustments", label: "Adjustments", rate: null, eventType: "dispute_adjustment" },
] as const;

export type ProgramKey = (typeof PROGRAM_TABS)[number]["key"];
export type TabKey = ProgramKey | "disputes";

export type LineStatus = "pending" | "needs_review" | "disputed" | "excluded" | "info" | "approved" | "paid";

export type PayrollLine = {
  id: string;
  run_id: string;
  lp_lead_id: string;
  campaign: string | null;
  agent_name: string | null;
  event_type: string;
  event_date: string;
  amount_cents: number;
  status: LineStatus;
  flag_reason: string | null;
};

export type PayrollRun = {
  id: string;
  partner_id: string | null;
  period_start: string;
  period_end: string;
  mode: "shadow" | "live";
  status: "pending" | "approved" | "paid" | "void";
  total_cents: number;
};

export type Dispute = {
  id: number;
  partner_id: string;
  ledger_id: string | null;
  lp_lead_id: string;
  event_type: string;
  event_date: string | null;
  claimed_amount_cents: number | null;
  reason: string;
  status: "open" | "approved" | "denied";
  filed_by_email: string;
  filed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  approved_amount_cents: number | null;
  applied_run_id: string | null;
};

/** Lines paid out (or on their way). `info`, flagged and excluded lines never count. */
export const PAYABLE: LineStatus[] = ["pending", "approved", "paid"];

export function programOf(eventType: string): ProgramKey | null {
  return PROGRAM_TABS.find((t) => t.eventType === eventType)?.key ?? null;
}

export type TabSummary = { key: TabKey; label: string; count: number; payableCents: number };

/**
 * The tabs this week shows, in a fixed order. Canvass, demos and Direct always
 * show (an empty week reads as "0", not as a missing program); Adjustments only
 * when the week has any. Disputes is always last.
 */
export function buildTabs(lines: Pick<PayrollLine, "event_type" | "status" | "amount_cents">[], openDisputes: number): TabSummary[] {
  const tabs: TabSummary[] = [];
  for (const t of PROGRAM_TABS) {
    const mine = lines.filter((l) => l.event_type === t.eventType);
    if (t.key === "adjustments" && mine.length === 0) continue;
    tabs.push({
      key: t.key,
      label: t.rate ? `${t.label} (${t.rate})` : t.label,
      count: mine.length,
      payableCents: mine.filter((l) => PAYABLE.includes(l.status)).reduce((s, l) => s + (l.amount_cents || 0), 0),
    });
  }
  tabs.push({ key: "disputes", label: "Disputes", count: openDisputes, payableCents: 0 });
  return tabs;
}

export function resolveTab(raw: string | null | undefined, tabs: TabSummary[]): TabKey {
  const keys = tabs.map((t) => t.key);
  return keys.includes(raw as TabKey) ? (raw as TabKey) : (keys[0] ?? "canvass");
}

/** Pick the week: the requested run if it is in the list, else the newest. */
export function resolveRun<T extends { id: string }>(runs: T[], raw: string | null | undefined): T | null {
  return runs.find((r) => r.id === raw) ?? runs[0] ?? null;
}

// ─── Labels ───────────────────────────────────────────────────────────────

export type Tone = "emerald" | "amber" | "rose" | "slate" | "navy" | "sky";

export function lineStatusBadge(status: LineStatus): { label: string; tone: Tone } {
  switch (status) {
    case "pending": return { label: "Ready to pay", tone: "emerald" };
    case "approved": return { label: "Approved", tone: "navy" };
    case "paid": return { label: "Paid", tone: "navy" };
    case "needs_review": return { label: "Needs review", tone: "amber" };
    case "disputed": return { label: "Disputed", tone: "rose" };
    case "excluded": return { label: "Excluded", tone: "slate" };
    case "info": return { label: "Info only", tone: "sky" };
    default: return { label: status, tone: "slate" };
  }
}

export function disputeStatusBadge(status: Dispute["status"]): { label: string; tone: Tone } {
  if (status === "approved") return { label: "Approved", tone: "emerald" };
  if (status === "denied") return { label: "Denied", tone: "rose" };
  return { label: "Open", tone: "amber" };
}

export const EVENT_LABELS: Record<string, string> = {
  canvass_confirmed_appt: "Canvass confirmation",
  completed_demo: "Completed demo",
  direct_job_net: "Direct job netted",
  dispute_adjustment: "Dispute adjustment",
};

export function eventLabel(t: string): string {
  return EVENT_LABELS[t] ?? t;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const n = Math.trunc(cents);
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** "9/14 – 9/20" from two YYYY-MM-DD dates. */
export function weekLabel(start: string, end: string): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(start)} – ${md(end)}`;
}

// ─── Who may do what (the page's courtesy; LP MCP is the gate) ────────────

/** A partner may dispute a line that is not settled. Approved/paid lines are final. */
export function canDisputeLine(line: Pick<PayrollLine, "status">, hasOpenTicket: boolean): boolean {
  return !hasOpenTicket && !["approved", "paid"].includes(line.status);
}

// ─── Form validation (mirrors LP MCP validateFiling / validateDecision) ───

export const DISPUTABLE_EVENTS = ["canvass_confirmed_appt", "completed_demo", "direct_job_net"] as const;

export type DisputeForm = {
  ledgerId?: string | null;
  lpLeadId?: string;
  eventType?: string;
  eventDate?: string;
  claimedAmount?: string;
  reason: string;
};

const DOLLARS = /^\$?\d{1,3}(,?\d{3})*(\.\d{1,2})?$|^\$?\d+(\.\d{1,2})?$/;

export function validateDisputeForm(f: DisputeForm): string | null {
  if ((f.reason ?? "").trim().length < 5) return "Please say what is wrong (a few words at least).";
  if ((f.reason ?? "").length > 2000) return "Please keep the reason under 2,000 characters.";
  if (f.claimedAmount && !DOLLARS.test(f.claimedAmount.trim())) return "Amount must be a dollar amount, like 250 or 15.00.";
  if (f.ledgerId) return null;
  if (!/^\d{3,12}$/.test((f.lpLeadId ?? "").trim())) return "Enter the LP lead ID (numbers only).";
  if (!DISPUTABLE_EVENTS.includes(f.eventType as (typeof DISPUTABLE_EVENTS)[number])) return "Choose what the lead should have earned.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.eventDate ?? "")) return "Choose the date it happened.";
  return null;
}

export function validateDecisionForm(decision: "approve" | "deny", note: string, amount: string): string | null {
  if (decision === "deny" && note.trim().length < 3) return "A denial needs a note — the partner will read it.";
  if (decision === "approve" && amount.trim() && !DOLLARS.test(amount.trim())) return "Amount must be a dollar amount, like 250 or 15.00.";
  return null;
}
