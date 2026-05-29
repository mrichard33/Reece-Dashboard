import { lpService } from "@/lib/supabase/lp";
import type {
  SystemEvent,
  ClaudeKnownIssue,
  ActivityItem,
  LeadLite,
} from "@/lib/supabase/types";

const LEAD_LITE_COLUMNS =
  "lp_lead_id, lp_prospect_id, ghl_contact_id, first_name, last_name, phone, email, lead_source, lead_source_detail, rep_name, disposition_label, appointment_set, demo_completed, job_value";

export async function getRecentActivity(limit = 20): Promise<ActivityItem[]> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("system_events")
      .select(
        "id, event_type, event_subtype, source, entity_type, entity_id, ghl_contact_id, lp_lead_id, lp_prospect_id, priority, payload, previous_state, new_state, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    const events = (data ?? []) as SystemEvent[];

    // Enrich with the contact (name / prospect # / source / subsource). LP-sourced
    // events carry lp_lead_id; GHL-sourced events carry only ghl_contact_id, which
    // lp_leads also stores — so we match on both, all within LP Supabase.
    const leadIds = [
      ...new Set(events.map((e) => e.lp_lead_id).filter((id): id is string => !!id)),
    ];
    const ghlIds = [
      ...new Set(
        events
          .filter((e) => !e.lp_lead_id && e.ghl_contact_id)
          .map((e) => e.ghl_contact_id as string),
      ),
    ];

    const byLpLead = new Map<string, LeadLite>();
    const byGhlContact = new Map<string, LeadLite>();

    if (leadIds.length > 0) {
      const { data: leads } = await sb
        .from("lp_leads")
        .select(LEAD_LITE_COLUMNS)
        .in("lp_lead_id", leadIds);
      for (const l of (leads ?? []) as LeadLite[]) byLpLead.set(l.lp_lead_id, l);
    }

    if (ghlIds.length > 0) {
      const { data: leads } = await sb
        .from("lp_leads")
        .select(LEAD_LITE_COLUMNS)
        .in("ghl_contact_id", ghlIds)
        .order("created_at_lp", { ascending: false });
      // A GHL contact can map to multiple LP leads; keep the most recent.
      for (const l of (leads ?? []) as LeadLite[]) {
        if (l.ghl_contact_id && !byGhlContact.has(l.ghl_contact_id)) {
          byGhlContact.set(l.ghl_contact_id, l);
        }
      }
    }

    return events.map((e) => ({
      ...e,
      lead: e.lp_lead_id
        ? (byLpLead.get(e.lp_lead_id) ?? null)
        : e.ghl_contact_id
          ? (byGhlContact.get(e.ghl_contact_id) ?? null)
          : null,
    }));
  } catch {
    return [];
  }
}

export async function getActiveAlerts(limit = 10): Promise<ClaudeKnownIssue[]> {
  try {
    const sb = lpService();
    const { data } = await sb
      .from("claude_known_issues")
      .select(
        "id, severity, category, description, status, reported_date, resolved_date, workflow_id, workflow_name, impact",
      )
      .eq("status", "open")
      .order("reported_date", { ascending: false })
      .limit(limit);
    return (data ?? []) as ClaudeKnownIssue[];
  } catch {
    return [];
  }
}
