/**
 * /workflows/[id] — one GHL workflow: registry metadata, its send schedule
 * (from the step graph), a readable logic tree, its triggers, and the
 * contacts carrying its `active-<code>` tag right now.
 *
 * "In this workflow" means the TAG, never `workflow_executions` — that table
 * is fed for ~25 workflows only (verified 2026-09-24).
 */
import { hlService } from "@/lib/supabase/hl";
import { loadRegistry } from "@/lib/journey/build";
import { loadWorkflowGraph } from "@/lib/journey/workflowGraph.server";
import { linearizeSchedule, logicTree, type LogicLine, type ScheduleRow } from "@/lib/journey/workflowGraph";
import { codesFor, DNC_TAGS, type RegistryEntry, sentPosition } from "@/lib/journey/tags";
import { toIso } from "@/lib/journey/normalize";
import { projectionAnchor, projectNext, tagRunStart, type TagSnapshot } from "@/lib/journey/projection";

export type RegistryMeta = {
  canonical_code: string | null;
  canonical_name: string | null;
  legacy_name: string | null;
  stage_family: string | null;
  workflow_category: string | null;
  workflow_role: string | null;
  psychological_stage: string | null;
  trust_state: string | null;
  cadence_profile: string | null;
  message_pressure_level: string | null;
  routes_to: string[] | null;
  receives_from: string[] | null;
  notes: string | null;
};

export type WorkflowLink = { ghlWorkflowId: string; code: string | null; name: string };

export type WorkflowTrigger = { name: string | null; event: string | null; value: string | null; active: boolean | null };

export type WorkflowDetail = {
  ghlWorkflowId: string;
  name: string;
  status: string | null;
  version: number | null;
  updatedAt: string | null;
  registry: RegistryMeta | null;
  /** Every tag code that means this workflow (canonical, legacy, dotless). */
  codes: string[];
  routesTo: WorkflowLink[];
  receivesFrom: WorkflowLink[];
  schedule: ScheduleRow[];
  logic: LogicLine[];
  triggers: WorkflowTrigger[];
  activeCount: number | null;
  stepCount: number;
};

/**
 * A contact carrying any of these is out of automation, whatever `active-*`
 * tag it still wears (the stop does not remove it — Kimberly, 2026-09-25).
 * "Active leads" never counts them.
 */
export const STOPPED_TAGS: readonly string[] = [...DNC_TAGS, "stop-bot"];

/** `active-<code>` for every spelling of the workflow's code. */
export function activeTagsFor(codes: readonly string[]): string[] {
  return [...new Set(codes.map((c) => `active-${c.toLowerCase()}`))];
}

export function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;
}

function link(id: string, registry: readonly RegistryEntry[], names: Map<string, string>): WorkflowLink {
  const reg = registry.find((r) => r.workflow_id === id);
  return { ghlWorkflowId: id, code: reg?.canonical_code ?? null, name: reg?.canonical_name ?? names.get(id) ?? id.slice(0, 8) };
}

export async function getWorkflowDetail(ghlWorkflowId: string): Promise<WorkflowDetail | null> {
  const sb = hlService();
  const [wfRes, regRes, trigRes, registry, graph] = await Promise.all([
    sb
      .from("workflows")
      .select("ghl_workflow_id, name, status, version, updated_at")
      .eq("ghl_workflow_id", ghlWorkflowId)
      .is("deleted_at", null)
      .maybeSingle(),
    sb
      .from("workflow_registry")
      .select(
        "canonical_code, canonical_name, legacy_name, stage_family, workflow_category, workflow_role, psychological_stage, trust_state, cadence_profile, message_pressure_level, routes_to, receives_from, notes",
      )
      .eq("workflow_id", ghlWorkflowId)
      .maybeSingle(),
    sb
      .from("workflow_triggers")
      .select("trigger_event, trigger_value, name:raw_json->>name, active:raw_json->>active")
      .eq("workflow_id", ghlWorkflowId),
    loadRegistry(),
    loadWorkflowGraph(ghlWorkflowId),
  ]);
  if (wfRes.error) throw new Error(`HL workflows: ${wfRes.error.message}`);
  const wf = wfRes.data as { ghl_workflow_id: string; name: string; status: string | null; version: number | null; updated_at: string | null } | null;
  if (!wf) return null;
  const reg = (regRes.data ?? null) as RegistryMeta | null;

  const regEntry: RegistryEntry | null = reg
    ? { canonical_code: reg.canonical_code, canonical_name: reg.canonical_name, legacy_name: reg.legacy_name, workflow_id: ghlWorkflowId }
    : null;
  const codes = regEntry ? codesFor(regEntry) : [];

  // Names for workflows the registry doesn't know (routes, remove_from_workflow).
  const { data: allWf } = await sb.from("workflows").select("ghl_workflow_id, name").is("deleted_at", null);
  const names = new Map(((allWf ?? []) as { ghl_workflow_id: string; name: string }[]).map((w) => [w.ghl_workflow_id, w.name]));
  const nameFor = (id: string) => {
    const r = registry.find((x) => x.workflow_id === id);
    return r?.canonical_code ?? names.get(id) ?? id.slice(0, 8);
  };

  let activeCount: number | null = null;
  if (codes.length) {
    const { count, error } = await sb
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .overlaps("tags", pgArray(activeTagsFor(codes)))
      .not("tags", "ov", pgArray(STOPPED_TAGS));
    activeCount = error ? null : (count ?? 0);
  }

  const triggers = ((trigRes.data ?? []) as { trigger_event: string | null; trigger_value: string | null; name: string | null; active: string | null }[]).map(
    (t) => ({
      name: t.name,
      event: t.trigger_event,
      value: t.trigger_value,
      active: t.active === null ? null : t.active === "true",
    }),
  );

  return {
    ghlWorkflowId,
    name: wf.name,
    status: wf.status,
    version: wf.version,
    updatedAt: toIso(wf.updated_at),
    registry: reg,
    codes,
    routesTo: (reg?.routes_to ?? []).map((id) => link(id, registry, names)),
    receivesFrom: (reg?.receives_from ?? []).map((id) => link(id, registry, names)),
    schedule: linearizeSchedule(graph),
    logic: logicTree(graph, nameFor),
    triggers,
    activeCount,
    stepCount: graph.steps.length,
  };
}

// ── Leads in this workflow ────────────────────────────────────────────────

export const WORKFLOW_CONTACTS_PAGE = 25;

export type WorkflowContactRow = {
  ghlContactId: string;
  name: string;
  phone: string | null;
  /** When the active tag last appeared (from the lead_events tag snapshots). */
  enteredAt: string | null;
  position: string;
  lastActivity: string | null;
  /** Next projected send, if the workflow will send one in 30 days. */
  next: { ts: string; title: string } | null;
};

export type WorkflowContactsPage = {
  rows: WorkflowContactRow[];
  nextCursor: { d: string; id: string } | null;
};

/**
 * A contact's recent tag snapshots (newest 150 contact_updated/created rows,
 * tags only). Enough to find when the current workflow run and its last send
 * began; one indexed single-contact read.
 */
async function recentSnapshots(contactId: string): Promise<TagSnapshot[]> {
  const { data } = await hlService()
    .from("lead_events")
    .select("event_time, tags:raw_json->tags")
    .eq("contact_id", contactId)
    .in("event_type", ["contact_updated", "contact_created"])
    .order("event_time", { ascending: false })
    .limit(150);
  return ((data ?? []) as { event_time: string; tags: unknown }[])
    .filter((r) => Array.isArray(r.tags))
    .map((r) => ({ ts: toIso(r.event_time) ?? r.event_time, tags: r.tags as string[] }));
}

export async function getWorkflowContacts(
  ghlWorkflowId: string,
  cursor: { d: string; id: string } | null,
): Promise<WorkflowContactsPage & { codes: string[] }> {
  const registry = await loadRegistry();
  const reg = registry.find((r) => r.workflow_id === ghlWorkflowId);
  if (!reg) return { rows: [], nextCursor: null, codes: [] };
  const codes = codesFor(reg);
  const activeTags = activeTagsFor(codes);

  let q = hlService()
    .from("contacts")
    .select("ghl_contact_id, first_name, last_name, phone, email, tags, date_updated")
    .is("deleted_at", null)
    .not("date_updated", "is", null)
    .overlaps("tags", pgArray(activeTags))
      .not("tags", "ov", pgArray(STOPPED_TAGS));
  if (cursor) q = q.or(`date_updated.lt.${cursor.d},and(date_updated.eq.${cursor.d},ghl_contact_id.lt.${cursor.id})`);
  const { data, error } = await q
    .order("date_updated", { ascending: false })
    .order("ghl_contact_id", { ascending: false })
    .limit(WORKFLOW_CONTACTS_PAGE + 1);
  if (error) throw new Error(`HL contacts: ${error.message}`);

  type Row = {
    ghl_contact_id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    tags: string[] | null;
    date_updated: string | null;
  };
  const all = (data ?? []) as Row[];
  const page = all.slice(0, WORKFLOW_CONTACTS_PAGE);
  const last = page[page.length - 1];

  const [graph, snaps] = await Promise.all([
    loadWorkflowGraph(ghlWorkflowId).catch(() => null),
    Promise.all(page.map((c) => recentSnapshots(c.ghl_contact_id))),
  ]);
  const now = new Date();

  return {
    codes,
    nextCursor:
      all.length > WORKFLOW_CONTACTS_PAGE && last?.date_updated
        ? { d: new Date(last.date_updated).toISOString(), id: last.ghl_contact_id }
        : null,
    rows: page.map((c, i) => {
      const tags = c.tags ?? [];
      const history = snaps[i] ?? [];
      const activeTag = activeTags.find((t) => tags.includes(t));
      const pos = sentPosition(tags, codes);
      const next = graph
        ? projectNext({
            tags,
            hasEmail: Boolean(c.email),
            hasPhone: Boolean(c.phone),
            code: reg.canonical_code ?? codes[0] ?? "",
            codes,
            graph,
            anchor: projectionAnchor(tags, history, codes),
            now,
          })[0]
        : undefined;
      const parts = [pos.email ? `Email ${pos.email}` : "", pos.sms ? `SMS ${pos.sms}` : ""].filter(Boolean);
      return {
        ghlContactId: c.ghl_contact_id,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unknown contact",
        phone: c.phone,
        enteredAt: activeTag ? tagRunStart(history, activeTag) : null,
        position: parts.length ? `${parts.join(" · ")} sent` : "No sends yet",
        lastActivity: toIso(c.date_updated),
        next: next ? { ts: next.ts, title: next.title } : null,
      };
    }),
  };
}
