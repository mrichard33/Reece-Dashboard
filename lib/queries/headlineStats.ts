import { lpService } from "@/lib/supabase/lp";
import { hlService } from "@/lib/supabase/hl";

export type HeadlineStats = {
  leadsToday: number;
  leadsYesterday: number;
  oppsInFlight: number;
  appointmentsToday: number;
  pendingApprovals: number;
  openIssues: number;
};

async function countLeadsBetween(start: Date, end: Date): Promise<number> {
  const sb = lpService();
  const { count } = await sb
    .from("lp_leads")
    .select("id", { count: "exact", head: true })
    .gte("created_at_lp", start.toISOString())
    .lt("created_at_lp", end.toISOString());
  return count ?? 0;
}

async function countOpenOpps(): Promise<number> {
  const sb = hlService();
  const { count } = await sb
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return count ?? 0;
}

async function countPendingApprovals(): Promise<number> {
  const sb = lpService();
  const { count } = await sb
    .from("groupme_approval_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

async function countOpenIssues(): Promise<number> {
  const sb = lpService();
  const { count } = await sb
    .from("claude_known_issues")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  return count ?? 0;
}

/**
 * Appointments today is not a clean SQL query — appointment dates live in
 * GHL custom fields that aren't reliably modeled in the HL cache yet. For
 * Phase 1 we proxy this with "opportunities updated today in an appt stage";
 * a more accurate query lands in Phase 2 with /appointments.
 */
async function countAppointmentsToday(): Promise<number> {
  const sb = hlService();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await sb
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .gte("updated_at", todayStart.toISOString());
  return count ?? 0;
}

export async function getHeadlineStats(): Promise<HeadlineStats> {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const [leadsToday, leadsYesterday, oppsInFlight, appointmentsToday, pendingApprovals, openIssues] =
    await Promise.all([
      countLeadsBetween(startToday, now).catch(() => 0),
      countLeadsBetween(startYesterday, startToday).catch(() => 0),
      countOpenOpps().catch(() => 0),
      countAppointmentsToday().catch(() => 0),
      countPendingApprovals().catch(() => 0),
      countOpenIssues().catch(() => 0),
    ]);

  return {
    leadsToday,
    leadsYesterday,
    oppsInFlight,
    appointmentsToday,
    pendingApprovals,
    openIssues,
  };
}

export function deltaText(today: number, prior: number): {
  text: string;
  tone: "emerald" | "rose" | "amber" | "slate";
} {
  const diff = today - prior;
  if (diff === 0) return { text: "= vs yesterday", tone: "slate" };
  if (diff > 0) return { text: `+${diff} vs yesterday`, tone: "emerald" };
  return { text: `${diff} vs yesterday`, tone: "rose" };
}
