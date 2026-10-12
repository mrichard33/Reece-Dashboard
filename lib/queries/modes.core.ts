/**
 * /modes view model: pure, no I/O (Fix 2, 2026-10-12).
 *
 * LP-MCP writes one row per `*_MODE` flag into `feature_modes` at every boot
 * (LP-MCP src/mode-registry.js). This module turns those rows into what the
 * page shows: which flags are in shadow, for how long, what would justify live,
 * and who decides.
 *
 * "Due for review" is a prompt, never a verdict. Whether a flag goes live is
 * Mark's (or the user's) call; the page only says it has waited long enough
 * that someone should look.
 */

export const REVIEW_AFTER_DAYS = 14;
export const NEEDS_RULING = "not set: needs a ruling";

export type ModeState = "live" | "shadow" | "off" | "choice" | "other";

export type ModeEvidence = { events?: string[]; table?: string; job?: string };

/** One `feature_modes` row as LP-MCP writes it. */
export type FeatureModeRow = {
  name: string;
  mode_group: string;
  kind: "enum" | "boolean" | "choice";
  current_value: string;
  current_state: ModeState;
  is_set: boolean;
  default_value: string;
  allowed_values: string[] | null;
  since: string | null;
  decider: string | null;
  evidence: ModeEvidence | null;
  go_live: string | null;
  note: string | null;
  registered_at: string;
  state_changed_at: string | null;
};

export type ModeChangeRow = {
  id: number;
  name: string;
  from_value: string | null;
  to_value: string | null;
  from_state: string | null;
  to_state: string | null;
  changed_at: string;
};

export type ModeItem = {
  name: string;
  group: string;
  state: ModeState;
  value: string;
  isSet: boolean;
  defaultValue: string;
  allowed: string[];
  daysInState: number | null;
  /** True when the count starts at the flag's first commit, not a recorded change. */
  daysFromSince: boolean;
  decider: string;
  goLive: string;
  hasRuling: boolean;
  note: string;
  evidence: ModeEvidence;
  dueForReview: boolean;
  /** Shadow events in the last 7 days; null when the flag records none as events. */
  events7d: number | null;
};

const DAY_MS = 86_400_000;

/** Days in the current state: from the recorded change, else from `since`. */
export function daysInState(
  row: Pick<FeatureModeRow, "state_changed_at" | "since">,
  nowMs: number,
): { days: number | null; fromSince: boolean } {
  const fromChange = row.state_changed_at ? Date.parse(row.state_changed_at) : NaN;
  if (Number.isFinite(fromChange)) {
    return { days: Math.max(0, Math.floor((nowMs - fromChange) / DAY_MS)), fromSince: false };
  }
  const fromSince = row.since ? Date.parse(`${row.since}T00:00:00Z`) : NaN;
  if (Number.isFinite(fromSince)) {
    return { days: Math.max(0, Math.floor((nowMs - fromSince) / DAY_MS)), fromSince: true };
  }
  return { days: null, fromSince: false };
}

export function toModeItems(
  rows: FeatureModeRow[],
  nowMs: number,
  events7d: Record<string, number> = {},
): ModeItem[] {
  return rows.map((r) => {
    const { days, fromSince } = daysInState(r, nowMs);
    const goLive = r.go_live || NEEDS_RULING;
    const evidence = r.evidence || {};
    return {
      name: r.name,
      group: r.mode_group,
      state: r.current_state,
      value: r.current_value,
      isSet: r.is_set,
      defaultValue: r.default_value,
      allowed: r.allowed_values || [],
      daysInState: days,
      daysFromSince: fromSince,
      decider: r.decider || "Mark",
      goLive,
      hasRuling: goLive !== NEEDS_RULING,
      note: r.note || "",
      evidence,
      dueForReview: r.current_state === "shadow" && days !== null && days >= REVIEW_AFTER_DAYS,
      events7d: evidence.events?.length ? (events7d[r.name] ?? null) : null,
    };
  });
}

export type ModeSummary = {
  total: number;
  shadow: number;
  live: number;
  off: number;
  other: number;
  dueForReview: number;
  noRuling: number;
};

export function summarizeModes(items: ModeItem[]): ModeSummary {
  const count = (s: ModeState) => items.filter((i) => i.state === s).length;
  return {
    total: items.length,
    shadow: count("shadow"),
    live: count("live"),
    off: count("off"),
    other: count("other"),
    dueForReview: items.filter((i) => i.dueForReview).length,
    noRuling: items.filter((i) => i.state === "shadow" && !i.hasRuling).length,
  };
}

/**
 * Page order: a value the code does not recognise first (a Railway typo is
 * a fault), then shadow longest-waiting first, then off, live and settings.
 */
export function sortModes(items: ModeItem[]): ModeItem[] {
  const rank: Record<ModeState, number> = { other: 0, shadow: 1, off: 2, live: 3, choice: 4 };
  return [...items].sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (b.daysInState ?? -1) - (a.daysInState ?? -1) ||
      a.name.localeCompare(b.name),
  );
}

export type StateBadge = {
  label: string;
  tone: "emerald" | "amber" | "slate" | "rose" | "sky";
};

export function stateBadge(state: ModeState): StateBadge {
  switch (state) {
    case "live":
      return { label: "Live", tone: "emerald" };
    case "shadow":
      return { label: "Test mode", tone: "amber" };
    case "off":
      return { label: "Off", tone: "slate" };
    case "choice":
      return { label: "Setting", tone: "sky" };
    default:
      return { label: "Unknown value", tone: "rose" };
  }
}

/** Where a flag's shadow results can be read, in words. */
export function evidenceLabel(item: Pick<ModeItem, "evidence" | "events7d">): string {
  const e = item.evidence;
  const parts: string[] = [];
  if (e.events?.length) {
    parts.push(
      item.events7d === null
        ? `events: ${e.events.join(", ")}`
        : `${item.events7d} event${item.events7d === 1 ? "" : "s"} in 7 days`,
    );
  }
  if (e.table) parts.push(`table ${e.table}`);
  if (e.job) parts.push(`job ${e.job}`);
  return parts.length ? parts.join(" · ") : "logs only";
}

export function daysLabel(item: Pick<ModeItem, "daysInState" | "daysFromSince">): string {
  if (item.daysInState === null) return "—";
  const d = `${item.daysInState} day${item.daysInState === 1 ? "" : "s"}`;
  return item.daysFromSince ? `${d} (since added)` : d;
}

/** Named so the page can print the file rather than "a migration". */
export const FEATURE_MODES_MIGRATION = {
  file: "supabase/migrations/20261012180000_feature_modes.sql",
  repo: "LP-MCP",
} as const;

export type ModesPageData = {
  items: ModeItem[];
  changes: ModeChangeRow[];
  needsMigration: boolean;
  /** When LP-MCP last wrote the table (its last boot). */
  registeredAt: string | null;
  errors: Record<string, string>;
};
