/**
 * The Leads tab: every GHL contact, newest entry first, 50 per page.
 *
 * Keyset-paginated on (date_added DESC, ghl_contact_id DESC) — LIMIT 51, no
 * count, no OFFSET — the same pattern as the per-lead LP feeds
 * (lib/queries/leads.ts). Pipeline and appointment state live in other HL
 * tables; the page reads them with a second query keyed by the page's ids,
 * never a join. LP is only ever consulted to RESOLVE an LP id to a contact.
 */
import { unstable_cache } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { hlService } from "@/lib/supabase/hl";
import { lpService } from "@/lib/supabase/lp";
import { lpMcp, lpUrlConfigured } from "@/lib/mcp/lpClient";
import { todayET } from "@/lib/date/sellingDays";
import {
  CF_LP_LEAD_ID,
  CF_LP_PROSPECT_ID,
  customField,
  type HlContactRow,
  loadPipelines,
  loadRegistry,
} from "@/lib/journey/build";
import {
  activeWorkflowCodes,
  botState,
  codesFor,
  DNC_TAGS,
  entryLane,
  lpRoute,
  parseTag,
  resolveWorkflowCode,
  stageTag,
} from "@/lib/journey/tags";
import { appointmentLabel, pipelineShort, stageName, toIso } from "@/lib/journey/normalize";
import {
  classifySearch,
  type LeadFilterOptions,
  type LeadRow,
  type LeadsCursor,
  type LeadsFilters,
  type LeadsPage,
} from "./leadsList.core";

export * from "./leadsList.core";

export const LEADS_PAGE_SIZE = 50;
/** An id-restricting filter (pipeline, appointment) reads at most this many ids. */
const ID_FILTER_CAP = 3000;
const ID_CHUNK = 150;

// Typed as plain `string` on purpose: the select-string type parser recurses
// past the compiler limit on a column list this long.
const LIST_COLUMNS: string =
  "ghl_contact_id, first_name, last_name, phone, email, city, state, source, tags, custom_fields, date_added, date_updated";

/** PostgREST array literal with every element quoted (tags carry ':'). */
function pgArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, "")}"`).join(",")}}`;
}

/** Strip the characters PostgREST's or()/ilike grammar treats as syntax. */
function safeTerm(s: string): string {
  return s.replace(/[,()*%\\"]/g, " ").replace(/\s+/g, " ").trim();
}

function etMidnight(daysAgo = 0): string {
  const start = fromZonedTime(`${todayET()}T00:00:00`, "America/New_York");
  return new Date(start.getTime() - daysAgo * 86_400_000).toISOString();
}

// ── The page ──────────────────────────────────────────────────────────────

function baseQuery() {
  return hlService().from("contacts").select(LIST_COLUMNS).is("deleted_at", null).not("date_added", "is", null);
}
type Query = ReturnType<typeof baseQuery>;

async function workflowTagsFor(codes: string[]): Promise<string[]> {
  const registry = await loadRegistry().catch(() => []);
  const out = new Set<string>();
  for (const code of codes) {
    out.add(`active-${code.toLowerCase()}`);
    const reg = resolveWorkflowCode(code, registry);
    if (reg) for (const c of codesFor(reg)) out.add(`active-${c.toLowerCase()}`);
  }
  return [...out];
}

/** Ids a pipeline/appointment filter allows, or null when no such filter is set. */
async function idRestriction(f: LeadsFilters): Promise<{ ids: string[] | null; truncated: boolean }> {
  const sb = hlService();
  const sets: string[][] = [];
  let truncated = false;

  if (f.pipeline || f.stage) {
    let q = sb.from("opportunities").select("ghl_contact_id").is("deleted_at", null).eq("status", "open");
    if (f.pipeline) q = q.eq("ghl_pipeline_id", f.pipeline);
    if (f.stage) q = q.eq("ghl_stage_id", f.stage);
    const { data, error } = await q.order("date_added", { ascending: false }).limit(ID_FILTER_CAP);
    if (error) throw new Error(`HL opportunities: ${error.message}`);
    const ids = (data ?? []).map((r) => r.ghl_contact_id as string).filter(Boolean);
    if (ids.length >= ID_FILTER_CAP) truncated = true;
    sets.push(ids);
  }

  if (f.appt) {
    const nowIso = new Date().toISOString();
    let q = sb.from("appointments").select("ghl_contact_id").is("deleted_at", null);
    q =
      f.appt === "open"
        ? q.gte("start_time", nowIso).not("status", "in", "(cancelled,noshow,invalid)")
        : q.in("status", ["cancelled", "noshow"]).gte("start_time", etMidnight(7));
    const { data, error } = await q.order("start_time", { ascending: false }).limit(ID_FILTER_CAP);
    if (error) throw new Error(`HL appointments: ${error.message}`);
    const ids = (data ?? []).map((r) => r.ghl_contact_id as string).filter(Boolean);
    if (ids.length >= ID_FILTER_CAP) truncated = true;
    sets.push(ids);
  }

  if (sets.length === 0) return { ids: null, truncated: false };
  let ids = new Set(sets[0]);
  for (const s of sets.slice(1)) ids = new Set(s.filter((x) => ids.has(x)));
  return { ids: [...ids], truncated };
}

/**
 * Synchronous on purpose. A Supabase builder is a thenable, so returning one
 * from an async function EXECUTES it — the caller gets a response, not a query.
 * Anything that needs I/O (workflow code → tag list) is resolved beforehand.
 */
function applyFilters(q: Query, f: LeadsFilters, workflowTags: string[]): Query {
  let out = q;
  if (f.entered === "today") out = out.gte("date_added", etMidnight(0));
  if (f.entered === "7d") out = out.gte("date_added", etMidnight(7));
  if (f.entered === "30d") out = out.gte("date_added", etMidnight(30));
  if (f.from) out = out.gte("date_added", fromZonedTime(`${f.from}T00:00:00`, "America/New_York").toISOString());
  if (f.to) out = out.lt("date_added", new Date(fromZonedTime(`${f.to}T00:00:00`, "America/New_York").getTime() + 86_400_000).toISOString());
  if (f.source.length) out = out.in("source", f.source);
  if (f.lane.length) out = out.overlaps("tags", pgArray(f.lane.flatMap((l) => [`entry:${l}`, `active-entry:${l}`])));
  if (workflowTags.length) out = out.overlaps("tags", pgArray(workflowTags));
  if (f.lpRoute.length) out = out.overlaps("tags", pgArray(f.lpRoute.map((r) => `lp-route:${r}`)));
  if (f.bot === "dnc") out = out.overlaps("tags", pgArray(DNC_TAGS));
  if (f.bot === "stopped") out = out.contains("tags", pgArray(["stop-bot"])).not("tags", "ov", pgArray(DNC_TAGS));
  if (f.bot === "active")
    out = out
      .contains("tags", pgArray(["agentic-active"]))
      .not("tags", "ov", pgArray([...DNC_TAGS, "stop-bot"]));
  if (f.bot === "none") out = out.not("tags", "ov", pgArray([...DNC_TAGS, "stop-bot", "agentic-active"]));
  // "Stuck" reads GHL's own last-change stamp on the contact: every tag,
  // field or stage change moves it. Max(lead_events) per contact cannot be a
  // WHERE clause without an aggregate the REST layer does not expose.
  if (f.stuck) out = out.lt("date_updated", new Date(Date.now() - f.stuck * 86_400_000).toISOString());
  return out;
}

function orderAndCursor(q: Query, cursor: LeadsCursor, limit: number): Query {
  let out = q;
  if (cursor) {
    // Cursor is a UTC ISO string (…Z): a '+' offset would break the .or() grammar.
    out = out.or(`date_added.lt.${cursor.d},and(date_added.eq.${cursor.d},ghl_contact_id.lt.${cursor.id})`);
  }
  return out
    .order("date_added", { ascending: false })
    .order("ghl_contact_id", { ascending: false })
    .limit(limit);
}

async function run(q: Query): Promise<HlContactRow[]> {
  const { data, error } = await q;
  if (error) throw new Error(`HL contacts: ${error.message}`);
  return (data ?? []) as unknown as HlContactRow[];
}

function sortContacts(rows: HlContactRow[]): HlContactRow[] {
  return rows.sort(
    (a, b) =>
      (b.date_added ?? "").localeCompare(a.date_added ?? "") || b.ghl_contact_id.localeCompare(a.ghl_contact_id),
  );
}

async function searchContacts(raw: string): Promise<{ rows: HlContactRow[]; mode: string }> {
  const s = classifySearch(raw);
  const limit = LEADS_PAGE_SIZE;

  if (s.kind === "phone") {
    const rows = await run(orderAndCursor(baseQuery().eq("phone", s.e164), null, limit));
    if (rows.length) return { rows, mode: "phone" };
    return { rows: await lpFallback(raw), mode: "phone (via LP)" };
  }
  if (s.kind === "ghl_id") {
    const rows = await run(baseQuery().eq("ghl_contact_id", s.id));
    if (rows.length) return { rows, mode: "GHL contact id" };
    return { rows: await run(orderAndCursor(nameQuery(s.id), null, limit)), mode: "name" };
  }
  if (s.kind === "lp_id") {
    // The LP id lives on the contact as a custom field; its value is stored
    // as a string on most rows and a number on some, so try both shapes.
    const variants = [CF_LP_PROSPECT_ID, CF_LP_LEAD_ID].flatMap((field) => [
      JSON.stringify([{ id: field, value: s.id }]),
      JSON.stringify([{ id: field, value: Number(s.id) }]),
    ]);
    const found = await Promise.all(variants.map((v) => run(baseQuery().contains("custom_fields", v))));
    const byId = new Map(found.flat().map((r) => [r.ghl_contact_id, r]));
    if (byId.size) return { rows: sortContacts([...byId.values()]), mode: "LP id" };
    const ghl = await resolveLpId(s.id);
    if (ghl) return { rows: await run(baseQuery().eq("ghl_contact_id", ghl)), mode: "LP id (via LP)" };
    return { rows: [], mode: "LP id" };
  }
  if (s.kind === "email") {
    return { rows: await run(orderAndCursor(baseQuery().ilike("email", `%${safeTerm(s.q)}%`), null, limit)), mode: "email" };
  }
  const rows = await run(orderAndCursor(nameQuery(s.q), null, limit));
  if (rows.length) return { rows, mode: "name" };
  return { rows: await lpFallback(raw), mode: "name (via LP)" };
}

function nameQuery(raw: string): Query {
  const term = safeTerm(raw);
  const words = term.split(" ").filter(Boolean);
  if (words.length >= 2) {
    return baseQuery()
      .ilike("first_name", `${words[0]}%`)
      .ilike("last_name", `${words.slice(1).join(" ")}%`);
  }
  return baseQuery().or(
    `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`,
  );
}

/** LP search_leads (name / phone ilike) → lp_leads.ghl_contact_id → contacts. */
async function lpFallback(raw: string): Promise<HlContactRow[]> {
  if (!lpUrlConfigured) return [];
  const r = await lpMcp.searchLeads(raw);
  if (!r.ok) return [];
  const leadIds = r.data.results.map((x) => x.lp_lead_id).filter(Boolean).slice(0, 10);
  if (leadIds.length === 0) return [];
  try {
    const { data } = await lpService().from("lp_leads").select("ghl_contact_id").in("lp_lead_id", leadIds);
    const ghl = [...new Set((data ?? []).map((d) => d.ghl_contact_id as string | null).filter((x): x is string => !!x))];
    if (ghl.length === 0) return [];
    return sortContacts(await run(baseQuery().in("ghl_contact_id", ghl)));
  } catch {
    return [];
  }
}

/**
 * LP lead id or Prospect id → ghl_contact_id. LP's lp_leads first (the owner
 * of the link), then the GHL custom fields. Null when neither knows it.
 */
export async function resolveLpId(id: string): Promise<string | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const { data } = await lpService()
      .from("lp_leads")
      .select("ghl_contact_id")
      .or(`lp_lead_id.eq.${id},lp_prospect_id.eq.${id}`)
      .not("ghl_contact_id", "is", null)
      .limit(1);
    const hit = (data ?? [])[0]?.ghl_contact_id as string | undefined;
    if (hit) return hit;
  } catch {
    /* LP unreachable — fall through to the HL custom fields */
  }
  for (const field of [CF_LP_LEAD_ID, CF_LP_PROSPECT_ID]) {
    for (const value of [id, Number(id)]) {
      const { data } = await hlService()
        .from("contacts")
        .select("ghl_contact_id")
        .contains("custom_fields", JSON.stringify([{ id: field, value }]))
        .is("deleted_at", null)
        .limit(1);
      const hit = (data ?? [])[0]?.ghl_contact_id as string | undefined;
      if (hit) return hit;
    }
  }
  return null;
}

export async function getLeadsPage({
  cursor,
  filters,
  search,
}: {
  cursor: LeadsCursor;
  filters: LeadsFilters;
  search: string | null;
}): Promise<LeadsPage> {
  if (search) {
    const { rows, mode } = await searchContacts(search);
    return { rows: await enrich(rows.slice(0, LEADS_PAGE_SIZE)), nextCursor: null, truncated: false, searchMode: mode };
  }

  const [{ ids, truncated }, workflowTags] = await Promise.all([
    idRestriction(filters),
    filters.workflow.length ? workflowTagsFor(filters.workflow) : Promise.resolve([]),
  ]);
  let contacts: HlContactRow[];
  if (ids === null) {
    contacts = await run(orderAndCursor(applyFilters(baseQuery(), filters, workflowTags), cursor, LEADS_PAGE_SIZE + 1));
  } else if (ids.length === 0) {
    contacts = [];
  } else {
    // Too many ids for one URL: run the same keyset page per chunk and merge.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
    const pages = await Promise.all(
      chunks.map((chunk) =>
        run(orderAndCursor(applyFilters(baseQuery().in("ghl_contact_id", chunk), filters, workflowTags), cursor, LEADS_PAGE_SIZE + 1)),
      ),
    );
    contacts = sortContacts(pages.flat()).slice(0, LEADS_PAGE_SIZE + 1);
  }

  const hasMore = contacts.length > LEADS_PAGE_SIZE;
  const page = contacts.slice(0, LEADS_PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor: LeadsCursor =
    hasMore && last?.date_added ? { d: new Date(last.date_added).toISOString(), id: last.ghl_contact_id } : null;

  return { rows: await enrich(page), nextCursor, truncated, searchMode: null };
}

/** Pipeline, last activity and next appointment for one page of contacts. */
async function enrich(contacts: HlContactRow[]): Promise<LeadRow[]> {
  if (contacts.length === 0) return [];
  const sb = hlService();
  const ids = contacts.map((c) => c.ghl_contact_id);
  const nowIso = new Date().toISOString();

  const [oppRes, apptRes, lastActs, pipelines, registry] = await Promise.all([
    sb
      .from("opportunities")
      .select("ghl_contact_id, ghl_pipeline_id, ghl_stage_id, status, date_updated")
      .in("ghl_contact_id", ids)
      .is("deleted_at", null),
    sb
      .from("appointments")
      .select("ghl_contact_id, title, status, start_time")
      .in("ghl_contact_id", ids)
      .is("deleted_at", null)
      .gte("start_time", nowIso)
      .not("status", "in", "(cancelled,noshow,invalid)")
      .order("start_time", { ascending: true }),
    // One indexed probe per contact (idx_lead_events_contact): the REST layer
    // has no GROUP BY, and an IN over 50 ids would pull every event they have.
    Promise.all(
      ids.map(async (id) => {
        const { data } = await sb
          .from("lead_events")
          .select("event_time")
          .eq("contact_id", id)
          .order("event_time", { ascending: false })
          .limit(1);
        return [id, (data ?? [])[0]?.event_time as string | undefined] as const;
      }),
    ),
    loadPipelines().catch(() => []),
    loadRegistry().catch(() => []),
  ]);

  const pipeById = new Map(pipelines.map((p) => [p.ghl_pipeline_id, p]));
  type OppLite = { ghl_contact_id: string; ghl_pipeline_id: string | null; ghl_stage_id: string | null; status: string | null; date_updated: string | null };
  const oppByContact = new Map<string, OppLite>();
  for (const o of (oppRes.data ?? []) as OppLite[]) {
    const cur = oppByContact.get(o.ghl_contact_id);
    const isOpen = (o.status ?? "") === "open";
    const curOpen = (cur?.status ?? "") === "open";
    if (!cur || (isOpen && !curOpen) || (isOpen === curOpen && (o.date_updated ?? "") > (cur.date_updated ?? ""))) {
      oppByContact.set(o.ghl_contact_id, o);
    }
  }
  const nextAppt = new Map<string, { start: string; label: string }>();
  for (const a of (apptRes.data ?? []) as { ghl_contact_id: string; title: string | null; start_time: string | null }[]) {
    if (!nextAppt.has(a.ghl_contact_id) && a.start_time) {
      nextAppt.set(a.ghl_contact_id, { start: toIso(a.start_time) ?? a.start_time, label: appointmentLabel(a.title) });
    }
  }
  const lastAct = new Map(lastActs);

  return contacts.map((c) => {
    const tags = c.tags ?? [];
    const opp = oppByContact.get(c.ghl_contact_id);
    const pipe = opp ? pipeById.get(opp.ghl_pipeline_id ?? "") : undefined;
    let lpStatus: string | null = null;
    for (const t of tags) {
      const p = parseTag(t);
      if (p.kind === "lp_status") lpStatus = p.value;
    }
    return {
      ghlContactId: c.ghl_contact_id,
      name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Unknown contact",
      phone: c.phone,
      city: c.city,
      enteredAt: toIso(c.date_added),
      source: c.source,
      entryLane: entryLane(tags),
      pipeline: pipelineShort(pipe),
      stage: opp ? stageName(pipe, opp.ghl_stage_id) : null,
      workflows: activeWorkflowCodes(tags).map((code) => {
        const reg = resolveWorkflowCode(code, registry);
        return { code: reg?.canonical_code ?? code, name: reg?.canonical_name ?? code };
      }),
      stageTag: stageTag(tags),
      lpRoute: lpRoute(tags),
      lpStatus,
      prospectId: customField(c.custom_fields, CF_LP_PROSPECT_ID),
      lastActivity: toIso(lastAct.get(c.ghl_contact_id) ?? null) ?? toIso(c.date_updated),
      nextAppointment: nextAppt.get(c.ghl_contact_id) ?? null,
      bot: botState(tags),
    };
  });
}

// ── Filter options ────────────────────────────────────────────────────────


/**
 * Chip options. Sources, lanes and LP routes are read from the newest 3,000
 * contacts (the REST layer has no DISTINCT) — anything older and rarer can
 * still be reached with the search box. Cached 10 minutes.
 */
export const getLeadFilterOptions = unstable_cache(
  async (): Promise<LeadFilterOptions> => {
    const [contactsRes, registry, pipelines] = await Promise.all([
      hlService()
        .from("contacts")
        .select("source, tags")
        .is("deleted_at", null)
        .order("date_added", { ascending: false })
        .limit(3000),
      loadRegistry().catch(() => []),
      loadPipelines().catch(() => []),
    ]);
    const sources = new Set<string>();
    const lanes = new Set<string>();
    const routes = new Set<string>();
    for (const r of (contactsRes.data ?? []) as { source: string | null; tags: string[] | null }[]) {
      if (r.source) sources.add(r.source);
      for (const t of r.tags ?? []) {
        const p = parseTag(t);
        if (p.kind === "entry") lanes.add(p.value);
        if (p.kind === "lp_route") routes.add(p.value);
      }
    }
    return {
      sources: [...sources].sort(),
      lanes: [...lanes].sort(),
      lpRoutes: [...routes].sort(),
      workflows: registry
        .filter((r) => r.canonical_code)
        .map((r) => ({ code: r.canonical_code as string, name: r.canonical_name ?? (r.canonical_code as string) }))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
      pipelines: pipelines
        .map((p) => ({
          id: p.ghl_pipeline_id,
          label: `${pipelineShort(p) ?? ""} ${p.name ?? ""}`.trim(),
          stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  },
  ["leads", "filter-options"],
  { revalidate: 600, tags: ["journey-static"] },
);
