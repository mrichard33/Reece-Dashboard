import { lpService } from "@/lib/supabase/lp";
import { hlService } from "@/lib/supabase/hl";
import { DAY_MS, businessDayStart } from "@/lib/time";

/**
 * Headline "Today" cards — definitions (keep these in sync with the card
 * labels in app/(dashboard)/overview/page.tsx and components/help/helpContent.ts).
 *
 *  leadsToday        LP `lp_leads` created today (created_at_lp ≥ ET-midnight).
 *                    created_at_lp is the true per-lead creation time, not sync time.
 *  leadsYesterday    Same, for the prior ET calendar day (drives the delta).
 *  appointmentsToday HL `appointments` whose scheduled start_time falls within
 *                    today's ET calendar day, that are not soft-deleted, and
 *                    whose status is not cancelled/invalid. This is a REAL
 *                    appointment date — not the old proxy that counted
 *                    opportunities touched by sync today.
 *  oppsInFlight      HL `opportunities` that are open, not soft-deleted, and were
 *                    genuinely updated in GHL (date_updated, NOT the sync-time
 *                    updated_at) within the last 30 days. Card label: "Opps in
 *                    flight (30d)". Excludes won/lost/abandoned and dormant opps.
 *  pendingApprovals  LP `groupme_approval_requests` with status='pending'.
 *  openIssues        LP `claude_known_issues` with status='open'.
 *
 * Day boundaries are anchored to America/New_York (Reece's business timezone) so
 * "today" matches how staff read the calendar, regardless of server timezone.
 */

const OPPS_ACTIVE_WINDOW_DAYS = 30;

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

/**
 * Open opportunities that are genuinely "in flight": open, not soft-deleted, and
 * updated in GHL within the last 30 days. Uses `date_updated` (the real GHL
 * timestamp) rather than `updated_at`, which is sync time and defaults to now().
 */
async function countOppsInFlight(): Promise<number> {
  const sb = hlService();
  const since = new Date(Date.now() - OPPS_ACTIVE_WINDOW_DAYS * DAY_MS);
  const { count } = await sb
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .is("deleted_at", null)
    .gte("date_updated", since.toISOString());
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
 * Appointments whose scheduled start falls within today's ET calendar day, that
 * are not soft-deleted, and whose status is not cancelled/invalid.
 * `appointments.start_time` is the real appointment timestamp synced from GHL.
 *
 * The status filter depends on the HL-MCP appointment-status mapping fix
 * (appointmentStatus → status column); before that ships every row reads
 * 'confirmed', so this filter is a harmless no-op until then.
 */
async function countAppointmentsToday(dayStart: Date, dayEnd: Date): Promise<number> {
  const sb = hlService();
  const { count } = await sb
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    // Exclude appointments GHL has cancelled or invalidated — they keep a
    // start_time today but are no longer real appointments on the books.
    .not("status", "in", '("cancelled","invalid")')
    .gte("start_time", dayStart.toISOString())
    .lt("start_time", dayEnd.toISOString());
  return count ?? 0;
}

export async function getHeadlineStats(): Promise<HeadlineStats> {
  const now = new Date();
  const startToday = businessDayStart(now);
  const startTomorrow = new Date(startToday.getTime() + DAY_MS);
  const startYesterday = new Date(startToday.getTime() - DAY_MS);

  const [leadsToday, leadsYesterday, oppsInFlight, appointmentsToday, pendingApprovals, openIssues] =
    await Promise.all([
      countLeadsBetween(startToday, now).catch(() => 0),
      countLeadsBetween(startYesterday, startToday).catch(() => 0),
      countOppsInFlight().catch(() => 0),
      countAppointmentsToday(startToday, startTomorrow).catch(() => 0),
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
