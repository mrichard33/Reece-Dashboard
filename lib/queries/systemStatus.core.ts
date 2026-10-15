/**
 * System status view-model — pure, no I/O (the `.core.ts` convention).
 *
 * LP-MCP's System Health layer (2026-10-15) writes one result per check into
 * `health_results`; two views roll the latest of each check up per system:
 *   - `v_system_status`        — checks in mode 'live' only (what the platform
 *                                officially reports, and what pages people)
 *   - `v_system_status_shadow` — every enabled check, shadow included
 * While everything is in shadow, the strip shows the shadow colors HOLLOW.
 * Once a system has live checks, its live color wins and is drawn solid.
 * A system with no checks at all is grey ("no checks"), never green.
 */

export type HealthColor = "red" | "yellow" | "green" | "grey";

export const SYSTEMS = [
  { id: "lead_perfection", label: "Lead Perfection" },
  { id: "five9", label: "Five9" },
  { id: "ghl", label: "GoHighLevel" },
  { id: "supabase", label: "Supabase" },
  { id: "n8n", label: "n8n" },
  { id: "railway", label: "Railway" },
  { id: "ai_agents", label: "AI agents" },
  { id: "webhooks", label: "Webhooks & Slack" },
] as const;

export type SystemId = (typeof SYSTEMS)[number]["id"];

export type SystemStatusRaw = {
  system: string;
  color: string | null;
  red: number | string | null;
  yellow: number | string | null;
  green: number | string | null;
  last_observed_at: string | null;
};

export type SystemChip = {
  id: SystemId;
  label: string;
  color: HealthColor;
  /** Drawn hollow: the color is the shadow (not yet live) reading. */
  hollow: boolean;
  red: number;
  yellow: number;
  green: number;
  lastObservedAt: string | null;
  /** "3 red, 2 yellow" / "all green" / "no checks". */
  note: string;
};

const n = (v: number | string | null | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const asColor = (c: string | null | undefined): HealthColor =>
  c === "red" || c === "yellow" || c === "green" ? c : "grey";

export function countsNote(red: number, yellow: number, green: number): string {
  if (!red && !yellow && !green) return "no checks";
  if (!red && !yellow) return "all green";
  return [red ? `${red} red` : null, yellow ? `${yellow} yellow` : null].filter(Boolean).join(", ");
}

/**
 * Eight chips in a fixed order. A system with a live row uses it (solid);
 * otherwise its shadow row (hollow); otherwise grey "no checks".
 */
export function shapeSystemStrip(live: SystemStatusRaw[], shadow: SystemStatusRaw[]): SystemChip[] {
  const liveBy = new Map(live.map((r) => [r.system, r]));
  const shadowBy = new Map(shadow.map((r) => [r.system, r]));
  return SYSTEMS.map(({ id, label }) => {
    const l = liveBy.get(id);
    const s = shadowBy.get(id);
    const row = l ?? s;
    if (!row) {
      return { id, label, color: "grey", hollow: false, red: 0, yellow: 0, green: 0, lastObservedAt: null, note: "no checks" };
    }
    const red = n(row.red);
    const yellow = n(row.yellow);
    const green = n(row.green);
    return {
      id,
      label,
      color: asColor(row.color),
      hollow: !l,
      red,
      yellow,
      green,
      lastObservedAt: row.last_observed_at,
      note: `${countsNote(red, yellow, green)}${l ? "" : " (shadow)"}`,
    };
  });
}

/** Tailwind classes for a chip's dot: solid when live, a ring when shadow. */
export function dotClass(color: HealthColor, hollow: boolean): string {
  const tone: Record<HealthColor, [string, string]> = {
    red: ["bg-rose-500", "ring-rose-500"],
    yellow: ["bg-amber-500", "ring-amber-500"],
    green: ["bg-emerald-500", "ring-emerald-500"],
    grey: ["bg-slate-400", "ring-slate-400"],
  };
  const [solid, ring] = tone[color];
  return hollow ? `bg-transparent ring-2 ring-inset ${ring}` : solid;
}
