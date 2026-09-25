/**
 * Workflows page filter state (2026-09-25): one object the page keeps in
 * React state, the presets bar saves per user, and the server action
 * validates on the way in and out. Pure — no React, no I/O.
 */
import { z } from "zod";
import type { RouteKey } from "./routes";
import type { SendVerdict } from "./sendActivity";

export const ROUTE_KEYS = [
  "intake",
  "entry",
  "reengage",
  "indoctrination",
  "positioning",
  "booking",
  "appointments",
  "customer",
  "objections",
  "lifecycle",
  "system",
  "other",
] as const satisfies readonly RouteKey[];

export const STATUS_FILTERS = ["all", "published", "draft", "no_sends", "turned_off"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_KEYS = ["chain", "favorites", "name", "code", "active", "sends", "changed"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const filterStateSchema = z
  .object({
    v: z.literal(1),
    q: z.string().max(200),
    routes: z.array(z.enum(ROUTE_KEYS)).max(ROUTE_KEYS.length),
    status: z.enum(STATUS_FILTERS),
    /** null = don't care, true = only workflows that send, false = only ones that don't. */
    hasMessages: z.boolean().nullable(),
    favoritesOnly: z.boolean(),
    sort: z.object({ key: z.enum(SORT_KEYS), dir: z.union([z.literal(1), z.literal(-1)]) }),
  })
  .strip();

export type WorkflowFilterState = z.infer<typeof filterStateSchema>;

export const DEFAULT_FILTERS: WorkflowFilterState = {
  v: 1,
  q: "",
  routes: [],
  status: "published",
  hasMessages: null,
  favoritesOnly: false,
  sort: { key: "chain", dir: 1 },
};

/** A stored preset that no longer parses (older shape) → defaults, never a crash. */
export function parseFilterState(input: unknown): WorkflowFilterState | null {
  const r = filterStateSchema.safeParse(input);
  return r.success ? r.data : null;
}

/** The fields a row must carry for filtering and sorting. */
export type FilterableRow = {
  ghlWorkflowId: string;
  name: string;
  status: "published" | "draft" | "unknown";
  canonicalCode: string | null;
  route: RouteKey;
  activeLeads: number | null;
  lastModified: string | null;
  messageSteps: number;
  sending: { sends30d: number | null; verdict: SendVerdict } | null;
};

export function applyFilters<R extends FilterableRow>(rows: readonly R[], f: WorkflowFilterState, favorites: ReadonlySet<string>): R[] {
  const term = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.routes.length && !f.routes.includes(r.route)) return false;
    if (f.status === "published" && r.status !== "published") return false;
    if (f.status === "draft" && r.status === "published") return false;
    // "No sends seen" is an earned verdict (lib/workflows/sendActivity.ts):
    // published, enough leads in, fresh data, nothing went out. A workflow we
    // could not measure, or with too few leads to judge, is never listed here.
    if (f.status === "no_sends" && !(r.status === "published" && r.sending?.verdict === "no_sends_seen")) return false;
    // Every message switched off in GHL — published, but nothing can send.
    if (f.status === "turned_off" && !(r.status === "published" && r.sending?.verdict === "turned_off")) return false;
    if (f.hasMessages === true && r.messageSteps === 0) return false;
    if (f.hasMessages === false && r.messageSteps > 0) return false;
    if (f.favoritesOnly && !favorites.has(r.ghlWorkflowId)) return false;
    if (term && !r.name.toLowerCase().includes(term) && !(r.canonicalCode ?? "").toLowerCase().includes(term)) return false;
    return true;
  });
}

/**
 * Sort. `chain` is the position each workflow holds in its funnel route
 * (lib/workflows/chain.ts); rows with no chain position sort after the
 * linked ones, by code. Nulls always sort last whatever the direction.
 */
export function sortRows<R extends FilterableRow>(
  rows: readonly R[],
  sort: WorkflowFilterState["sort"],
  favorites: ReadonlySet<string>,
  chain: ReadonlyMap<string, number>,
): R[] {
  // No code sorts after every code, whatever the collation does with "~".
  const byCode = (a: R, b: R) => {
    if (a.canonicalCode === null || b.canonicalCode === null) return a.canonicalCode === b.canonicalCode ? 0 : a.canonicalCode === null ? 1 : -1;
    return a.canonicalCode.localeCompare(b.canonicalCode, undefined, { numeric: true });
  };
  const num = (x: number | null | undefined) => (x === null || x === undefined ? null : x);
  const cmpNum = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1; // nulls last regardless of direction
    if (b === null) return -1;
    return (a - b) * sort.dir;
  };
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort.key) {
      case "chain": {
        const ca = chain.get(a.ghlWorkflowId) ?? null;
        const cb = chain.get(b.ghlWorkflowId) ?? null;
        return cmpNum(ca, cb) || byCode(a, b);
      }
      case "favorites": {
        const fa = favorites.has(a.ghlWorkflowId) ? 0 : 1;
        const fb = favorites.has(b.ghlWorkflowId) ? 0 : 1;
        return (fa - fb) * sort.dir || byCode(a, b);
      }
      case "name":
        return a.name.localeCompare(b.name, undefined, { numeric: true }) * sort.dir;
      case "code":
        return byCode(a, b) * sort.dir;
      case "active":
        return cmpNum(num(a.activeLeads), num(b.activeLeads)) || byCode(a, b);
      case "sends":
        return cmpNum(num(a.sending?.sends30d), num(b.sending?.sends30d)) || byCode(a, b);
      case "changed":
        return cmpNum(a.lastModified ? Date.parse(a.lastModified) : null, b.lastModified ? Date.parse(b.lastModified) : null) || byCode(a, b);
    }
  });
  return out;
}
