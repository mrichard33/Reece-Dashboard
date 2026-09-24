/**
 * The Leads tab's pure half: types, the query-string grammar and the search
 * classifier. Split from leadsList.ts (which does the I/O) so it unit-tests
 * without Supabase, MCP or next/cache — the same *.core.ts split the rest of
 * lib/ uses.
 */
import type { BotState } from "@/lib/journey/types";

export type LeadsCursor = { d: string; id: string } | null;

export type LeadsView = "new-today" | "stuck-7d" | "cancelled-week";

export type LeadsFilters = {
  entered: "today" | "7d" | "30d" | null;
  from: string | null;
  to: string | null;
  source: string[];
  lane: string[];
  workflow: string[];
  lpRoute: string[];
  bot: BotState | null;
  stuck: 3 | 7 | 14 | null;
  pipeline: string | null;
  stage: string | null;
  appt: "open" | "missed" | null;
};

export type LeadRow = {
  ghlContactId: string;
  name: string;
  phone: string | null;
  city: string | null;
  enteredAt: string | null;
  source: string | null;
  entryLane: string | null;
  pipeline: string | null;
  stage: string | null;
  workflows: { code: string; name: string }[];
  stageTag: string | null;
  lpRoute: string | null;
  lpStatus: string | null;
  prospectId: string | null;
  lastActivity: string | null;
  nextAppointment: { start: string; label: string } | null;
  bot: BotState;
};

export type LeadsPage = {
  rows: LeadRow[];
  nextCursor: LeadsCursor;
  /** Set when a filter matched more ids than ID_FILTER_CAP. */
  truncated: boolean;
  /** Set for a search: how the box was read ("phone", "lp id", "name" …). */
  searchMode: string | null;
};

// ── Query-string parsing (pure) ───────────────────────────────────────────

type Search = Record<string, string | string[] | undefined>;

/**
 * Multi-value filters travel as REPEATED params (`?source=a&source=b`), never
 * comma-joined: real sources contain commas ("Landing Page, Reece ChatBot").
 */
function list(v: string | string[] | undefined): string[] {
  const raw = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
}
function one(v: string | string[] | undefined): string | null {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : null;
}

export function emptyFilters(): LeadsFilters {
  return {
    entered: null,
    from: null,
    to: null,
    source: [],
    lane: [],
    workflow: [],
    lpRoute: [],
    bot: null,
    stuck: null,
    pipeline: null,
    stage: null,
    appt: null,
  };
}

/** The three built-in views are just filter presets (spec §B3). */
export function viewFilters(view: LeadsView): Partial<LeadsFilters> {
  if (view === "new-today") return { entered: "today" };
  if (view === "stuck-7d") return { stuck: 7 };
  return { appt: "missed" };
}

export function parseLeadsQuery(sp: Search): {
  filters: LeadsFilters;
  search: string | null;
  view: LeadsView | null;
  cursor: LeadsCursor;
} {
  const f = emptyFilters();
  const entered = one(sp.entered);
  if (entered === "today" || entered === "7d" || entered === "30d") f.entered = entered;
  f.from = one(sp.from);
  f.to = one(sp.to);
  f.source = list(sp.source);
  f.lane = list(sp.lane);
  f.workflow = list(sp.workflow).map((c) => c.toUpperCase());
  f.lpRoute = list(sp.lpRoute);
  const bot = one(sp.bot);
  if (bot === "active" || bot === "stopped" || bot === "dnc" || bot === "none") f.bot = bot;
  const stuck = Number(one(sp.stuck));
  if (stuck === 3 || stuck === 7 || stuck === 14) f.stuck = stuck;
  f.pipeline = one(sp.pipeline);
  f.stage = one(sp.stage);
  const appt = one(sp.appt);
  if (appt === "open" || appt === "missed") f.appt = appt;

  const viewRaw = one(sp.view);
  const view: LeadsView | null =
    viewRaw === "new-today" || viewRaw === "stuck-7d" || viewRaw === "cancelled-week" ? viewRaw : null;
  if (view) Object.assign(f, viewFilters(view));

  const d = one(sp.cursorDate);
  const id = one(sp.cursorId);
  return { filters: f, search: one(sp.q), view, cursor: d && id ? { d, id } : null };
}

/** Phone in any format → E.164 (+1 for 10-digit US numbers). Null if not a phone. */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 11 && digits.length <= 15 && input.trim().startsWith("+")) return `+${digits}`;
  return null;
}

export type SearchKind =
  | { kind: "phone"; e164: string }
  | { kind: "lp_id"; id: string }
  | { kind: "ghl_id"; id: string }
  | { kind: "email"; q: string }
  | { kind: "name"; q: string };

/** How the one search box reads its input (spec §B3). Pure — unit-tested. */
export function classifySearch(raw: string): SearchKind {
  const q = raw.trim();
  if (/^\d{3,9}$/.test(q)) return { kind: "lp_id", id: q };
  const e164 = /^[\d\s()+.-]+$/.test(q) ? toE164(q) : null;
  if (e164) return { kind: "phone", e164 };
  if (q.includes("@")) return { kind: "email", q };
  // GHL ids are ~20 url-safe chars mixing letters and digits, no spaces.
  if (/^[A-Za-z0-9]{15,32}$/.test(q) && /\d/.test(q) && /[A-Za-z]/.test(q)) return { kind: "ghl_id", id: q };
  return { kind: "name", q };
}


export type LeadFilterOptions = {
  sources: string[];
  lanes: string[];
  lpRoutes: string[];
  workflows: { code: string; name: string }[];
  pipelines: { id: string; label: string; stages: { id: string; name: string }[] }[];
};
