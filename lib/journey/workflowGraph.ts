/**
 * A GHL workflow's step graph → a send schedule and a readable logic tree.
 * Pure: the loader lives in workflowGraph.server.ts.
 *
 * Three things the live graph taught us (HL `workflow_steps`, 2026-09-24):
 *
 * 1. `delay_minutes` is NOT minutes. "Wait 1 Hour" stores 1, "24 Hours" 24,
 *    "30 days" 43200. The truth is `raw.data.startAfter` = {type, value}, and
 *    `type` arrives plural ("hour", "days", "minutes") as often as singular.
 * 2. "Take the first branch" is not a schedule. S2.2's first if/else branch is
 *    "Indoctrination Active" → exit; the sends are all down the else side, and
 *    every email sits behind a "Not Sent (Continue)" check. So the schedule
 *    walks EVERY branch (each node once) and records the branch path, and a
 *    contact's projection evaluates tag conditions instead of guessing.
 * 3. The workflow numbers its own sends: each email is followed by
 *    `Add Tag: sent:s2.2-e1`. That tag — not encounter order — is what a
 *    contact's `sent:*` tag refers to, so it wins when present.
 */

export type GraphStep = {
  id: string;
  order: number;
  type: string;
  name: string;
  /** Enclosing branch node (or condition node, for a branch node). */
  parent: string | null;
  /** "branch-yes" | "branch-no" | "condition-node" | null */
  nodeType: string | null;
  next: string[];
  data: Record<string, unknown>;
  templateId: string | null;
  branchCondition: string | null;
};

export type WorkflowGraph = {
  workflowId: string;
  steps: GraphStep[];
  connections: { from: string; to: string; condition: string | null }[];
  templates: Record<string, { name: string | null; subject: string | null; body: string | null }>;
};

export type ScheduleRow = {
  stepId: string;
  type: "sms" | "email";
  /** Per-channel number — `sent:<code>-e<n>` / `-s<n>` refers to this. */
  n: number;
  offsetMinutes: number;
  day: number;
  name: string;
  subject: string | null;
  preview: string;
  body: string;
  from: string | null;
  branchPath: string[];
  templateId: string | null;
  /** Body is filled at send time (ChatGPT step / custom-field merge). */
  aiWritten: boolean;
  /** Waits on this path whose unit could not be read (counted as 0). */
  unparsedWait: boolean;
  /** Event waits passed on the way ("waits for: reply, up to 30 days"). */
  waitNotes: string[];
};

// ── Rows → graph ──────────────────────────────────────────────────────────

export type WorkflowStepRow = {
  step_id: string;
  step_order: number | null;
  step_type: string | null;
  template_id: string | null;
  branch_condition: string | null;
  raw_json: unknown;
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function toGraphStep(row: WorkflowStepRow): GraphStep {
  const rawJson = obj(row.raw_json);
  const raw = Object.keys(obj(rawJson.raw)).length ? obj(rawJson.raw) : rawJson;
  const nextRaw = raw.next;
  const next = typeof nextRaw === "string" ? [nextRaw] : Array.isArray(nextRaw) ? nextRaw.filter((x): x is string => typeof x === "string") : [];
  return {
    id: row.step_id,
    order: row.step_order ?? 0,
    type: row.step_type ?? String(raw.type ?? "unknown"),
    name: String(raw.name ?? rawJson.name ?? row.step_type ?? ""),
    parent: typeof raw.parent === "string" ? raw.parent : null,
    nodeType: typeof raw.nodeType === "string" ? raw.nodeType : null,
    next,
    data: obj(raw.data),
    templateId: row.template_id,
    branchCondition: row.branch_condition,
  };
}

// ── Waits ─────────────────────────────────────────────────────────────────

const UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  hour: 60,
  hours: 60,
  hr: 60,
  hrs: 60,
  day: 1440,
  days: 1440,
  week: 10080,
  weeks: 10080,
};

/**
 * `startAfter` → minutes. Accepts the whole `raw_json` (reads
 * raw.data.startAfter), a step's `data`, or the startAfter object itself.
 * Never reads `delay_minutes`.
 */
export function parseStartAfter(input: unknown): { minutes: number; unparsed: boolean } {
  const root = obj(input);
  const sa = obj(
    obj(obj(root.raw).data).startAfter ?? obj(root.data).startAfter ?? root.startAfter ?? (root.type !== undefined && root.value !== undefined ? root : null),
  );
  const unit = String(sa.type ?? "").toLowerCase();
  const value = Number(sa.value);
  const per = UNIT_MINUTES[unit];
  if (!per || !Number.isFinite(value) || value < 0) return { minutes: 0, unparsed: true };
  return { minutes: Math.round(value * per), unparsed: false };
}

/** "1h", "24h", "30d", "5m", "1d 2h". */
export function formatMinutes(m: number): string {
  if (m <= 0) return "0m";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", min ? `${min}m` : ""].filter(Boolean).join(" ");
}

// ── Branch evaluation ─────────────────────────────────────────────────────

/** What we can know about a contact when choosing a branch. */
export type ContactFacts = { tags: readonly string[]; hasEmail?: boolean; hasPhone?: boolean };

type Condition = { conditionSubType?: unknown; conditionOperator?: unknown; conditionValue?: unknown };

function evalCondition(c: Condition, facts: ContactFacts): boolean | null {
  const sub = String(c.conditionSubType ?? "");
  const op = String(c.conditionOperator ?? "");
  if (sub === "tags") {
    const want = (Array.isArray(c.conditionValue) ? c.conditionValue : [c.conditionValue]).map((v) => String(v).toLowerCase());
    const have = new Set(facts.tags.map((t) => t.toLowerCase()));
    const any = want.some((w) => have.has(w));
    if (op === "index-of-true") return any;
    if (op === "index-of-false") return !any;
    return null;
  }
  if (sub === "email" && op === "has_value" && facts.hasEmail !== undefined) return facts.hasEmail;
  if (sub === "phone" && op === "has_value" && facts.hasPhone !== undefined) return facts.hasPhone;
  return null;
}

function combine(values: (boolean | null)[], operator: string): boolean | null {
  if (operator === "or") {
    if (values.some((v) => v === true)) return true;
    return values.some((v) => v === null) ? null : false;
  }
  if (values.some((v) => v === false)) return false;
  return values.some((v) => v === null) ? null : true;
}

/** A branch definition (from the condition node's data.branches) → true/false/unknown. */
export function evaluateBranch(branch: Record<string, unknown>, facts: ContactFacts): boolean | null {
  const segments = Array.isArray(branch.segments) ? (branch.segments as Record<string, unknown>[]) : [];
  if (segments.length === 0) return null;
  const segValues = segments.map((s) => {
    const conds = Array.isArray(s.conditions) ? (s.conditions as Condition[]) : [];
    if (conds.length === 0) return null;
    return combine(conds.map((c) => evalCondition(c, facts)), String(s.operator ?? "and"));
  });
  return combine(segValues, String(branch.operator ?? "and"));
}

// ── Walking ───────────────────────────────────────────────────────────────

const MAX_EXPANSIONS = 600;

function indexGraph(graph: WorkflowGraph) {
  const byId = new Map(graph.steps.map((s) => [s.id, s]));
  const connFrom = new Map<string, string[]>();
  for (const c of graph.connections) {
    const arr = connFrom.get(c.from) ?? [];
    if (!arr.includes(c.to)) arr.push(c.to);
    connFrom.set(c.from, arr);
  }
  const children = (s: GraphStep): string[] => {
    if (s.type === "goto") {
      const target = s.data.targetNodeId;
      return typeof target === "string" ? [target] : [];
    }
    return s.next.length ? s.next : (connFrom.get(s.id) ?? []);
  };
  return { byId, children };
}

/** Workflow start: the lowest-ordered step with no parent. */
export function rootStep(graph: WorkflowGraph): GraphStep | null {
  const roots = graph.steps.filter((s) => !s.parent).sort((a, b) => a.order - b.order);
  return roots[0] ?? [...graph.steps].sort((a, b) => a.order - b.order)[0] ?? null;
}

const EVENT_WAITS = new Set(["condition", "reply", "link_clicked", "appointment", "email_event"]);

function textOf(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function messageContent(step: GraphStep, graph: WorkflowGraph) {
  const d = step.data;
  const tplId = step.templateId ?? textOf(d.templateId) ?? textOf(d.template_id);
  const tpl = tplId ? graph.templates[tplId] : undefined;
  const inline = textOf(d.html) ?? textOf(d.body) ?? textOf(d.message);
  const body = inline ?? tpl?.body ?? "";
  const subject = step.type === "email" ? (textOf(d.subject) ?? tpl?.subject ?? null) : null;
  return {
    body,
    subject,
    from: textOf(d.from_name) ?? textOf(d.fromName),
    templateId: tplId,
    aiWritten: /\{\{\s*(chatgpt|contact\.ai_|custom_values\.ai)/i.test(body) || (!inline && !tpl?.body && step.type === "email"),
  };
}

export function previewText(text: string, n = 90): string {
  const plain = text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > n ? `${plain.slice(0, n - 1).trimEnd()}…` : plain;
}

/** The `sent:<code>-e<n>` a workflow stamps right after a send, if it does. */
function stampedNumber(step: GraphStep, idx: ReturnType<typeof indexGraph>): number | null {
  const want = step.type === "email" ? "e" : "s";
  let cur: GraphStep | undefined = step;
  for (let hop = 0; hop < 4 && cur; hop++) {
    const nextId: string | undefined = idx.children(cur)[0];
    cur = nextId ? idx.byId.get(nextId) : undefined;
    if (!cur) break;
    if (cur.type === "sms" || cur.type === "email") break;
    if (cur.type === "add_contact_tag") {
      const tags = Array.isArray(cur.data.tags) ? (cur.data.tags as unknown[]) : [];
      for (const t of tags) {
        const m = /^sent:[a-z]\d*(?:\.\d+)?-(e|s)(\d+)$/i.exec(String(t));
        if (m && m[1]?.toLowerCase() === want) return Number(m[2]);
      }
    }
  }
  return null;
}

export type WalkOptions = {
  /** Start here instead of the workflow root (projection: the last send). */
  startId?: string;
  /** Skip the start step itself (it already happened). */
  skipStart?: boolean;
  /** Evaluate if/else branches against these facts; unknown → first branch. */
  facts?: ContactFacts;
  /** Stop after this many messages (projection: 5). */
  maxMessages?: number;
  /** Stop past this offset (projection: 30 days). */
  maxMinutes?: number;
  /**
   * Sends already made, so an unstamped send after the start is numbered
   * from here rather than from 1 (projection starts mid-workflow).
   */
  counterSeed?: { email: number; sms: number };
};

export type WalkResult = { rows: ScheduleRow[]; dependsOn: string[] };

/**
 * Walk the graph accumulating waits. Without `facts`, every branch is walked
 * (each node once, first path wins) — the workflow's full schedule. With
 * `facts`, one path is chosen per if/else — a single contact's future.
 */
export function walkSchedule(graph: WorkflowGraph, opts: WalkOptions = {}): WalkResult {
  const idx = indexGraph(graph);
  const start = opts.startId ? idx.byId.get(opts.startId) : rootStep(graph);
  const rows: ScheduleRow[] = [];
  const dependsOn: string[] = [];
  const expanded = new Set<string>();
  const counters = { email: opts.counterSeed?.email ?? 0, sms: opts.counterSeed?.sms ?? 0 };
  let expansions = 0;

  const visit = (id: string, offset: number, path: string[], notes: string[], unparsed: boolean, skip = false): void => {
    if (expansions >= MAX_EXPANSIONS) return;
    if (opts.maxMessages && rows.length >= opts.maxMessages) return;
    if (opts.maxMinutes !== undefined && offset > opts.maxMinutes) return;
    const step = idx.byId.get(id);
    if (!step || expanded.has(id)) return;
    expanded.add(id);
    expansions++;

    let off = offset;
    let unp = unparsed;
    const kids = idx.children(step);

    if (!skip && (step.type === "sms" || step.type === "email")) {
      const c = messageContent(step, graph);
      const stamped = stampedNumber(step, idx);
      const n = stamped ?? counters[step.type] + 1;
      counters[step.type] = Math.max(counters[step.type], n);
      rows.push({
        stepId: step.id,
        type: step.type,
        n,
        offsetMinutes: off,
        day: Math.floor(off / 1440),
        name: step.name,
        subject: c.subject,
        preview: previewText(c.subject && step.type === "email" && !c.body ? c.subject : c.body),
        body: c.body,
        from: c.from,
        branchPath: path,
        templateId: c.templateId,
        aiWritten: c.aiWritten,
        unparsedWait: unp,
        waitNotes: notes,
      });
    }

    if (step.type === "wait" && !skip) {
      const waitType = String(step.data.type ?? "time");
      const label = String(step.data.name ?? step.name);
      const w = parseStartAfter(step.data);
      if (EVENT_WAITS.has(waitType) && kids.length > 1) {
        // "Wait until X, or give up after N": one child fires on the event /
        // condition (transition type wait_condition, wait_reply …), the other
        // on the timeout (wait_timeout).
        const isTimeout = (k: string) => {
          const t = idx.byId.get(k);
          return `${String(t?.data.type ?? "")} ${t?.name ?? ""}`.toLowerCase().includes("timeout");
        };
        const eventKid = kids.find((k) => !isTimeout(k));
        const timeoutKid = kids.find(isTimeout);
        const onTimeout = () =>
          timeoutKid && visit(timeoutKid, off + w.minutes, path, [...notes, `if no ${label} within ${formatMinutes(w.minutes)}`], unp || w.unparsed);
        if (!opts.facts) {
          if (eventKid) visit(eventKid, off, path, waitType === "condition" ? notes : [...notes, `on ${label}`], unp);
          onTimeout();
          return;
        }
        // One contact: a condition wait can be checked against their tags
        // (S2.2's "Pause Workflow Active?" passes unless `pause-workflow`);
        // a reply or a click cannot be predicted, so assume the timeout.
        if (waitType === "condition") {
          const branches = obj(step.data.condition).branches;
          const def = Array.isArray(branches) ? obj(branches[0]) : {};
          const v = evaluateBranch(def, opts.facts);
          if (v === false) return void onTimeout();
          if (v === null) dependsOn.push(label);
          if (eventKid) visit(eventKid, off, path, notes, unp);
          return;
        }
        return void onTimeout();
      }
      off += w.minutes;
      unp = unp || w.unparsed;
      if (EVENT_WAITS.has(waitType)) notes = [...notes, `waits for: ${label}`];
    }

    // Branching: a condition node's children are its branch nodes.
    const isCondition = step.type === "if_else" && kids.length > 1;
    if (isCondition && opts.facts) {
      const branches = Array.isArray(step.data.branches) ? (step.data.branches as Record<string, unknown>[]) : [];
      let chosen: string | null = null;
      let unknownFirst: string | null = null;
      for (const kid of kids) {
        const def = branches.find((b) => b.id === kid);
        if (!def) continue; // the else branch
        const v = evaluateBranch(def, opts.facts);
        if (v === true) {
          chosen = kid;
          break;
        }
        if (v === null && !unknownFirst) unknownFirst = kid;
      }
      const elseKid = kids.find((k) => !branches.some((b) => b.id === k)) ?? null;
      if (!chosen && unknownFirst) {
        chosen = unknownFirst;
        dependsOn.push(idx.byId.get(unknownFirst)?.name ?? "a condition");
      }
      chosen ??= elseKid;
      if (chosen) visit(chosen, off, [...path, idx.byId.get(chosen)?.name ?? "branch"], notes, unp);
      return;
    }

    for (const kid of kids) {
      const kidStep = idx.byId.get(kid);
      const label = kids.length > 1 ? kidStep?.name : undefined;
      visit(kid, off, label ? [...path, label] : path, notes, unp);
    }
  };

  if (start) visit(start.id, 0, [], [], false, Boolean(opts.skipStart));
  // Walk order is graph order; a schedule reads in send order.
  const ordered = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.offsetMinutes - b.r.offsetMinutes || a.i - b.i)
    .map((x) => x.r);
  return { rows: ordered, dependsOn: [...new Set(dependsOn)] };
}

/**
 * Every tag the workflow's own "Add Tag" steps stamp. A contact did not carry
 * these when they ENTERED, so replaying the workflow from entry must not see
 * them: S2.2 opens with "already indoctrinating? exit", and a contact halfway
 * through carries exactly the tags that guard checks for.
 */
export function tagsAddedBy(graph: WorkflowGraph): Set<string> {
  const out = new Set<string>();
  for (const s of graph.steps) {
    if (s.type !== "add_contact_tag") continue;
    for (const t of Array.isArray(s.data.tags) ? s.data.tags : []) out.add(String(t).toLowerCase());
  }
  return out;
}

/** The workflow's full send schedule (every branch), in send order. */
export function linearizeSchedule(graph: WorkflowGraph): ScheduleRow[] {
  return walkSchedule(graph).rows;
}

// ── Logic tree ────────────────────────────────────────────────────────────

export type LogicLine = { id: string; order: number; depth: number; type: string; text: string; branch: boolean };

function listish(v: unknown, max = 8): string {
  const arr = Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
  return arr.length > max ? `${arr.slice(0, max).join(", ")} +${arr.length - max} more` : arr.join(", ");
}

/**
 * Steps in `step_order`, indented by how many enclosing branches they sit in
 * (`parent` chain). No graph library — indentation carries the structure.
 */
export function logicTree(
  graph: WorkflowGraph,
  workflowName: (ghlWorkflowId: string) => string = (id) => id.slice(0, 8),
): LogicLine[] {
  const byId = new Map(graph.steps.map((s) => [s.id, s]));
  const depthMemo = new Map<string, number>();
  const depth = (s: GraphStep, guard = 0): number => {
    if (depthMemo.has(s.id)) return depthMemo.get(s.id)!;
    const parent = s.parent ? byId.get(s.parent) : undefined;
    const d = parent && guard < 50 ? depth(parent, guard + 1) + 1 : 0;
    depthMemo.set(s.id, d);
    return d;
  };

  return [...graph.steps]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const d = s.data;
      const branch = s.type === "if_else" && (s.nodeType === "branch-yes" || s.nodeType === "branch-no");
      let text: string;
      switch (s.type) {
        case "if_else":
          text = branch ? `↳ ${s.name}${s.nodeType === "branch-no" ? " (else)" : ""}` : `If / else: ${s.branchCondition ?? s.name}`;
          break;
        case "add_contact_tag":
          text = `Add tags: ${listish(d.tags)}`;
          break;
        case "remove_contact_tag":
          text = `Remove tags: ${listish(d.tags)}`;
          break;
        case "update_contact_field": {
          const fields = Array.isArray(d.fields) ? (d.fields as Record<string, unknown>[]) : [];
          text = `Set ${fields.map((f) => `${String(f.title ?? f.field)} = ${String(f.value ?? "")}`.slice(0, 80)).join("; ") || s.name}`;
          break;
        }
        case "remove_from_workflow":
          text = `Remove from: ${listish((Array.isArray(d.workflow_id) ? d.workflow_id : [d.workflow_id]).filter(Boolean).map((id) => workflowName(String(id))), 6)}`;
          break;
        case "add_to_workflow":
          text = `Add to workflow: ${typeof d.workflow_id === "string" ? workflowName(d.workflow_id) : s.name}`;
          break;
        case "wait": {
          const w = parseStartAfter(d);
          const kind = String(d.type ?? "time");
          text = kind === "time" ? `Wait ${w.unparsed ? "(unreadable unit)" : formatMinutes(w.minutes)}` : `Wait for ${s.name}${w.unparsed ? "" : ` (timeout ${formatMinutes(w.minutes)})`}`;
          break;
        }
        case "email":
          text = `Email: ${String(d.subject ?? s.name)}`;
          break;
        case "sms":
          text = `SMS: ${previewText(String(d.body ?? d.message ?? s.name), 80)}`;
          break;
        case "webhook":
          text = `Webhook ${String(d.method ?? "POST")} ${String(d.url ?? "").replace(/^https?:\/\//, "").slice(0, 60)}`;
          break;
        case "goto": {
          const t = typeof d.targetNodeId === "string" ? byId.get(d.targetNodeId) : undefined;
          text = `Go to: ${t?.name ?? "another step"}`;
          break;
        }
        case "transition":
          text = `↳ ${s.name}`;
          break;
        default:
          text = `${s.type.replace(/_/g, " ")}: ${s.name}`;
      }
      return { id: s.id, order: s.order, depth: depth(s), type: s.type, text, branch: branch || s.type === "transition" };
    });
}
