/**
 * LP side of a journey, read straight from the LP Supabase (2026-09-25).
 *
 * PR #184 read it through LP MCP `get_contact_timeline`. Two defects there made
 * the timeline wrong, and both are fixed by reading the tables directly:
 *   - Notes carried `rep_name`, a column lp_notes does not have (it is
 *     `created_by_rep_name`), so a Revin summary could not be told from a
 *     rep's note.
 *   - One prospect can hold several LP leads (Blankenbicker: 4 lead ids under
 *     Prospect 451087) and LP stores every call once PER LEAD. With a 200-row
 *     cap per source, four copies of each call pushed real history out.
 * Items keep the MCP tool's shape so `lpEvents` stays the one normalizer; the
 * cross-lead dedupe happens there.
 */
import { lpService } from "@/lib/supabase/lp";
import type { LpTimelineItem } from "./normalize";

const CAP = { calls: 1500, notes: 800, activities: 800, events: 500, actions: 500 };

export type LpSourceResult =
  | { ok: true; items: LpTimelineItem[]; leadIds: string[]; prospectId: string | null }
  | { ok: false; error: string };

function iso(x: string | null | undefined): string | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type LeadRow = {
  lp_lead_id: string;
  lp_prospect_id: string | null;
  lead_source_detail: string | null;
  disposition_code: string | null;
  disposition_label: string | null;
  rep_name: string | null;
  created_at_lp: string | null;
};

export async function loadLpTimeline(ghlContactId: string): Promise<LpSourceResult> {
  try {
    const sb = lpService();
    const leadsRes = await sb
      .from("lp_leads")
      .select("lp_lead_id, lp_prospect_id, lead_source_detail, disposition_code, disposition_label, rep_name, created_at_lp")
      .eq("ghl_contact_id", ghlContactId);
    if (leadsRes.error) return { ok: false, error: leadsRes.error.message };
    const leads = (leadsRes.data ?? []) as LeadRow[];
    const leadIds = leads.map((l) => l.lp_lead_id);

    const byLead = <T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
      Promise.resolve(p).then((r) => {
        if (r.error) throw new Error(r.error.message);
        return (r.data ?? []) as T[];
      });

    const none = Promise.resolve([] as never[]);
    const [calls, notes, activities, events, actions] = await Promise.all([
      leadIds.length
        ? byLead<Record<string, unknown>>(
            sb
              .from("lp_call_logs")
              .select("id, lp_lead_id, call_date, call_duration_sec, call_result, call_direction, rep_name, agent_name, call_notes, recording_url")
              .in("lp_lead_id", leadIds)
              .order("call_date", { ascending: false })
              .limit(CAP.calls),
          )
        : none,
      leadIds.length
        ? byLead<Record<string, unknown>>(
            sb
              .from("lp_notes")
              .select("id, lp_lead_id, note_body, note_type, note_category, note_origin, created_by_rep_name, created_at_lp")
              .in("lp_lead_id", leadIds)
              .order("created_at_lp", { ascending: false })
              .limit(CAP.notes),
          )
        : none,
      leadIds.length
        ? byLead<Record<string, unknown>>(
            sb
              .from("lp_activities")
              .select("id, lp_lead_id, activity_type, activity_detail, rep_name, activity_date")
              .in("lp_lead_id", leadIds)
              .order("activity_date", { ascending: false })
              .limit(CAP.activities),
          )
        : none,
      byLead<Record<string, unknown>>(
        sb
          .from("system_events")
          .select("id, event_type, event_subtype, source, payload, processed, action_taken, event_timestamp, created_at")
          .eq("ghl_contact_id", ghlContactId)
          .order("created_at", { ascending: false })
          .limit(CAP.events),
      ),
      byLead<Record<string, unknown>>(
        sb
          .from("agent_actions")
          .select("id, action_type, target_system, status, reasoning, rule_applied, executed_at, error_message, created_at")
          .eq("target_id", ghlContactId)
          .order("created_at", { ascending: false })
          .limit(CAP.actions),
      ),
    ]);

    const items: LpTimelineItem[] = [];
    for (const l of leads) {
      const ts = iso(l.created_at_lp);
      if (!ts) continue;
      items.push({
        ts,
        source: "lp",
        type: "lead_created",
        summary: `LP lead ${l.lp_lead_id} created (${l.lead_source_detail ?? "unknown source"}) — disposition: ${l.disposition_label ?? l.disposition_code ?? "none"}`,
        detail: { lp_lead_id: l.lp_lead_id, rep: l.rep_name },
      });
    }
    for (const c of calls) {
      const ts = iso(c.call_date as string);
      if (!ts) continue;
      items.push({
        ts,
        source: "lp",
        type: "call",
        summary: "Call",
        detail: { id: c.id, rep: c.rep_name, lp_lead_id: c.lp_lead_id, raw: c },
      });
    }
    for (const n of notes) {
      const ts = iso(n.created_at_lp as string);
      if (!ts) continue;
      const body = String(n.note_body ?? "");
      items.push({
        ts,
        source: "lp",
        type: "note",
        summary: body.length > 100 ? `${body.slice(0, 100)}…` : body,
        detail: {
          id: n.id,
          full_note: body,
          rep: n.created_by_rep_name,
          note_origin: n.note_origin,
          note_category: n.note_category,
          lp_lead_id: n.lp_lead_id,
        },
      });
    }
    for (const a of activities) {
      const ts = iso(a.activity_date as string);
      if (!ts) continue;
      items.push({
        ts,
        source: "lp",
        type: "activity",
        summary: `Activity: ${String(a.activity_type ?? "unknown")}`,
        detail: { id: a.id, activity_type: a.activity_type, activity_detail: a.activity_detail, rep_name: a.rep_name, lp_lead_id: a.lp_lead_id },
      });
    }
    for (const e of events) {
      const ts = iso((e.event_timestamp as string) ?? (e.created_at as string));
      if (!ts) continue;
      items.push({
        ts,
        source: "agentic",
        type: `event:${String(e.event_type)}`,
        summary: `${String(e.event_type)}${e.event_subtype ? ` (${String(e.event_subtype)})` : ""}`,
        detail: { id: e.id, source_system: e.source, event_subtype: e.event_subtype, payload: e.payload, action_taken: e.action_taken },
      });
    }
    for (const a of actions) {
      const ts = iso((a.executed_at as string) ?? (a.created_at as string));
      if (!ts) continue;
      items.push({
        ts,
        source: "agentic",
        type: `action:${String(a.action_type)}`,
        summary: `${String(a.action_type)} → ${String(a.target_system)} — ${String(a.status)}${a.error_message ? ` (${String(a.error_message)})` : ""}`,
        detail: { id: a.id, rule: a.rule_applied, reasoning: a.reasoning, status: a.status },
      });
    }

    const prospectId = leads.find((l) => l.lp_prospect_id)?.lp_prospect_id ?? null;
    return { ok: true, items, leadIds, prospectId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
