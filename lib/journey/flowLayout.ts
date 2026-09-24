/**
 * A workflow's step graph → a drawable flowchart (boxes, arrows, labels),
 * laid out as a top-down tree with every branch side by side. Pure — the
 * component only draws what this returns.
 *
 * Rules that keep a 130-step workflow readable (S2.1 v3):
 *  - If/else branch nodes and wait "transition" nodes are not boxes; they
 *    become the LABEL on the arrow ("Email Exist · has an email").
 *  - A step reached a second time (a merge, or a "go to") is drawn once; the
 *    second arrival is a small "↪ continues at …" chip, never a back-arrow.
 *  - Runs of plain updates (tags, fields) fold into one box with a list.
 *  - Steps the start can never reach are returned separately as
 *    `unreachable`, so nothing in the workflow is hidden.
 */
import {
  EVENT_WAITS,
  formatMinutes,
  type GraphStep,
  indexGraph,
  linearizeSchedule,
  messageContent,
  parseStartAfter,
  previewText,
  rootStep,
  type WorkflowGraph,
} from "./workflowGraph";

export type FlowKind = "start" | "condition" | "message" | "wait" | "update" | "workflow" | "webhook" | "jump" | "end" | "other";

export type FlowNode = {
  id: string;
  stepId: string | null;
  kind: FlowKind;
  title: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  /** GHL "skip action" set on the step. */
  skipped?: boolean;
  /** Target workflow id for add-to / remove-from boxes. */
  workflowIds?: string[];
  detail?: { type: string; name: string; text?: string; subject?: string | null; from?: string | null };
};

export type FlowEdge = { from: string; to: string; label?: string };

export type Flow = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  width: number;
  height: number;
  unreachable: FlowNode[];
  stats: { steps: number; messages: number; conditions: number; waits: number };
};

export const BOX_W = 220;
export const BOX_H = 64;
const GAP_X = 28;
const ROW_H = BOX_H + 56;

type Tree = {
  id: string;
  stepId: string | null;
  kind: FlowKind;
  title: string;
  lines: string[];
  skipped?: boolean;
  workflowIds?: string[];
  detail?: FlowNode["detail"];
  children: { label?: string; node: Tree }[];
};

// ── Plain-English conditions ─────────────────────────────────────────────

type Cond = { conditionSubType?: unknown; conditionOperator?: unknown; conditionValue?: unknown; conditionType?: unknown };

function describeCondition(c: Cond): string {
  const sub = String(c.conditionSubType ?? "");
  const op = String(c.conditionOperator ?? "");
  const vals = (Array.isArray(c.conditionValue) ? c.conditionValue : [c.conditionValue]).filter((v) => v !== undefined && v !== null && v !== "").map(String);
  const list = vals.join(" or ");
  if (sub === "tags") return op === "index-of-false" ? `does not have tag ${list}` : `has tag ${list}`;
  if (sub === "trigger") return "came in through this workflow's trigger";
  if (op === "has_value") return `has ${sub || "a value"}`;
  if (op === "has_no_value") return `has no ${sub || "value"}`;
  if (sub === "day_week") return `day of week ${op} ${list}`;
  if (sub === "quarter_hour") return `time ${op} ${list}`;
  const field = /^[A-Za-z0-9]{20}$/.test(sub) ? "a custom field" : sub.replace(/_/g, " ") || "a field";
  return `${field} ${op} ${list}`.trim();
}

/** A branch definition (condition node's data.branches[i]) in plain words. */
export function describeBranch(def: Record<string, unknown> | undefined): string {
  if (!def) return "";
  const segs = Array.isArray(def.segments) ? (def.segments as Record<string, unknown>[]) : [];
  const parts = segs.map((sg) => {
    const conds = Array.isArray(sg.conditions) ? (sg.conditions as Cond[]) : [];
    return conds.map(describeCondition).join(String(sg.operator ?? "and") === "or" ? " or " : " and ");
  });
  return parts.filter(Boolean).join(String(def.operator ?? "and") === "or" ? " — or — " : " — and — ");
}

// ── Step → box ───────────────────────────────────────────────────────────

function listish(v: unknown, max = 3): string {
  const arr = Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
  return arr.length > max ? `${arr.slice(0, max).join(", ")} +${arr.length - max}` : arr.join(", ");
}

/** GHL names most waits just "wait"; a jump chip needs "Wait 1d" to be findable. */
function stepLabel(s: GraphStep): string {
  if (s.type !== "wait") return s.name || s.type;
  const w = parseStartAfter(s.data);
  if (EVENT_WAITS.has(String(s.data.type ?? "time"))) return `Wait until: ${String(s.data.name ?? s.name)}`;
  return w.unparsed ? s.name || "wait" : `Wait ${formatMinutes(w.minutes)}`;
}

function isPassThrough(s: GraphStep): boolean {
  return s.type === "transition" || (s.type === "if_else" && (s.nodeType === "branch-yes" || s.nodeType === "branch-no"));
}

export function buildFlow(graph: WorkflowGraph, workflowName: (id: string) => string = (id) => id.slice(0, 8)): Flow {
  const idx = indexGraph(graph);
  const numbers = new Map(linearizeSchedule(graph).map((r) => [r.stepId, r.n]));
  const drawn = new Map<string, string>(); // stepId → name, once drawn
  let seq = 0;
  const nid = () => `n${seq++}`;

  const end = (): Tree => ({ id: nid(), stepId: null, kind: "end", title: "End", lines: [], children: [] });

  /** A branch/transition node stands for "whatever comes after it". */
  const through = (stepId: string): string | null => {
    let cur = idx.byId.get(stepId);
    let guard = 0;
    while (cur && isPassThrough(cur) && guard++ < 20) {
      const k = idx.children(cur)[0];
      if (!k) return null;
      cur = idx.byId.get(k);
    }
    return cur?.id ?? null;
  };

  const build = (stepId: string | null): Tree => {
    if (!stepId) return end();
    const step = idx.byId.get(stepId);
    if (!step) return end();
    if (isPassThrough(step)) return build(through(step.id));
    if (drawn.has(step.id)) {
      return { id: nid(), stepId: step.id, kind: "jump", title: `↪ continues at: ${drawn.get(step.id)}`, lines: [], children: [] };
    }
    drawn.set(step.id, step.name || step.type);

    const d = step.data;
    const kids = idx.children(step);
    const node: Tree = { id: nid(), stepId: step.id, kind: "other", title: step.name || step.type, lines: [], children: [] };
    if (d.skipAction === true) node.skipped = true;

    if (step.type === "goto") {
      // A go-to usually targets a branch node GHL names "yes"/"no"; name the
      // real step after it (or the decision it belongs to) instead.
      let target = typeof d.targetNodeId === "string" ? idx.byId.get(d.targetNodeId) : undefined;
      let via: string | null = null;
      if (target && isPassThrough(target)) {
        const owner = target.parent ? idx.byId.get(target.parent) : undefined;
        via = owner && !isPassThrough(owner) ? `${owner.name} (${target.name})` : null;
        const real = through(target.id);
        target = real ? idx.byId.get(real) : undefined;
      }
      return { ...node, kind: "jump", title: `↪ go to: ${target ? stepLabel(target) : (via ?? "another step")}`, lines: via && target ? [`after ${via}`] : [] };
    }

    if (step.type === "if_else" && kids.length > 1) {
      const branches = Array.isArray(d.branches) ? (d.branches as Record<string, unknown>[]) : [];
      node.kind = "condition";
      node.title = `If: ${step.branchCondition && step.branchCondition !== "Condition" ? step.branchCondition : step.name}`;
      node.children = kids.map((k) => {
        const kidStep = idx.byId.get(k);
        const def = branches.find((b) => b.id === k);
        const name = kidStep?.name ?? (def ? String(def.name ?? "branch") : "Otherwise");
        const words = def ? describeBranch(def) : "none of the above";
        return { label: `${name}${words ? ` · ${words}` : ""}`, node: build(k) };
      });
      return node;
    }

    if (step.type === "wait") {
      const waitType = String(d.type ?? "time");
      const w = parseStartAfter(d);
      node.kind = "wait";
      const label = String(d.name ?? step.name);
      if (EVENT_WAITS.has(waitType)) {
        node.title = `Wait until: ${label}`;
        node.lines = [w.unparsed ? "no time limit read" : `gives up after ${formatMinutes(w.minutes)}`];
      } else {
        node.title = w.unparsed ? "Wait (unreadable unit)" : `Wait ${formatMinutes(w.minutes)}`;
      }
      if (kids.length > 1) {
        node.children = kids.map((k) => {
          const t = idx.byId.get(k);
          const timeout = `${String(t?.data.type ?? "")} ${t?.name ?? ""}`.toLowerCase().includes("timeout");
          return { label: timeout ? `if not within ${formatMinutes(w.minutes)}` : "when it happens", node: build(k) };
        });
        return node;
      }
    } else if (step.type === "sms" || step.type === "email") {
      const c = messageContent(step, graph);
      const n = numbers.get(step.id);
      node.kind = "message";
      node.title = `${step.type === "email" ? "Email" : "SMS"}${n ? ` ${n}` : ""}`;
      node.lines = [
        step.type === "email" ? (c.subject ?? step.name) : c.aiWritten ? "(written by AI at send time)" : previewText(c.body, 70),
        ...(c.from ? [`from ${c.from}`] : []),
      ];
      node.detail = { type: step.type, name: step.name, text: c.body, subject: c.subject, from: c.from };
    } else if (step.type === "add_contact_tag" || step.type === "remove_contact_tag") {
      node.kind = "update";
      node.lines = [`${step.type === "add_contact_tag" ? "+" : "−"} ${listish(d.tags)}`];
      node.title = step.type === "add_contact_tag" ? "Add tags" : "Remove tags";
    } else if (step.type === "update_contact_field" || step.type === "create_opportunity" || step.type === "assign_user" || step.type === "update_opportunity") {
      node.kind = "update";
      node.lines = [step.name];
      node.title = step.type === "update_contact_field" ? "Update field" : step.type.replace(/_/g, " ");
    } else if (step.type === "add_to_workflow" || step.type === "remove_from_workflow") {
      const ids = (Array.isArray(d.workflow_id) ? d.workflow_id : [d.workflow_id]).filter(Boolean).map(String);
      node.kind = "workflow";
      node.title = step.type === "add_to_workflow" ? "Add to workflow" : "Remove from workflows";
      node.lines = [listish(ids.map(workflowName), 4)];
      node.workflowIds = ids;
    } else if (step.type === "webhook") {
      node.kind = "webhook";
      node.title = step.name || "Webhook";
      node.lines = [String(d.url ?? "").replace(/^https?:\/\//, "").slice(0, 48)];
    }

    if (kids.length > 1) {
      node.children = kids.map((k) => ({ label: idx.byId.get(k)?.name, node: build(k) }));
    } else {
      node.children = [{ node: kids[0] ? build(kids[0]) : end() }];
    }
    return node;
  };

  const root = rootStep(graph);
  const start: Tree = { id: nid(), stepId: null, kind: "start", title: "Contact enters", lines: [], children: [{ node: build(root?.id ?? null) }] };
  foldUpdates(start);

  // ── Layout ────────────────────────────────────────────────────────────
  // Left-aligned contour packing (2026-09-25). A plain tidy tree centred
  // each parent over ALL of its children, so S2.1 v3 came out ~4,900px wide
  // with the main path drifting diagonally and every early exit parked past
  // the whole rest of the workflow. Here the first child sits straight under
  // its parent (the "continue" path is a straight spine) and each later
  // branch slides left until it would touch what is already drawn at the
  // same depths — an exit that ends in two boxes tucks in beside the spine.
  type Contour = [number, number][]; // per depth below the node: [left, right]
  const offsets = new Map<Tree, number[]>();
  const layout = (t: Tree): Contour => {
    const own: [number, number] = [0, BOX_W];
    if (t.children.length === 0) return [own];
    const acc: Contour = [];
    const offs: number[] = [];
    t.children.forEach((c, i) => {
      const sub = layout(c.node);
      let off = 0;
      if (i > 0) {
        off = offs[i - 1]! + BOX_W + GAP_X;
        for (let d = 0; d < Math.min(sub.length, acc.length); d++) off = Math.max(off, acc[d]![1] + GAP_X - sub[d]![0]);
      }
      offs.push(off);
      sub.forEach(([l, r], d) => {
        const cur = acc[d];
        acc[d] = cur ? [Math.min(cur[0], l + off), Math.max(cur[1], r + off)] : [l + off, r + off];
      });
    });
    offsets.set(t, offs);
    return [own, ...acc];
  };
  const contour = layout(start);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const place = (t: Tree, x: number, depth: number) => {
    nodes.push({
      id: t.id,
      stepId: t.stepId,
      kind: t.kind,
      title: t.title,
      lines: t.lines,
      x,
      y: depth * ROW_H,
      w: BOX_W,
      h: t.kind === "end" || t.kind === "start" || (t.kind === "jump" && t.lines.length === 0) ? 34 : BOX_H,
      skipped: t.skipped,
      workflowIds: t.workflowIds,
      detail: t.detail,
    });
    const offs = offsets.get(t) ?? [];
    t.children.forEach((c, i) => {
      edges.push({ from: t.id, to: c.node.id, label: c.label });
      place(c.node, x + (offs[i] ?? 0), depth + 1);
    });
  };
  place(start, 0, 0);
  const maxDepth = contour.length - 1;
  const width = Math.max(...contour.map(([, r]) => r));

  // Everything the start can never reach, so nothing is silently hidden.
  const unreachable: FlowNode[] = graph.steps
    .filter((s) => !drawn.has(s.id) && !isPassThrough(s))
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: `u${i}`,
      stepId: s.id,
      kind: "other" as FlowKind,
      title: s.name || s.type,
      lines: [s.type.replace(/_/g, " ")],
      x: 0,
      y: 0,
      w: BOX_W,
      h: BOX_H,
    }));

  return {
    nodes,
    edges,
    width: width + 2,
    height: (maxDepth + 1) * ROW_H,
    unreachable,
    stats: {
      steps: graph.steps.length,
      messages: graph.steps.filter((s) => s.type === "sms" || s.type === "email").length,
      conditions: graph.steps.filter((s) => s.type === "if_else" && !isPassThrough(s)).length,
      waits: graph.steps.filter((s) => s.type === "wait").length,
    },
  };
}

/** Consecutive plain updates on a straight line fold into one box. */
function foldUpdates(t: Tree): void {
  if (t.kind === "update") {
    const lines = [`${t.title}: ${t.lines.join(" ")}`];
    let only = t.children[0];
    while (t.children.length === 1 && only && !only.label && only.node.kind === "update" && !t.skipped && !only.node.skipped) {
      lines.push(`${only.node.title}: ${only.node.lines.join(" ")}`);
      t.children = only.node.children;
      only = t.children[0];
    }
    if (lines.length > 1) {
      t.title = `${lines.length} updates`;
      t.lines = lines.length > 3 ? [...lines.slice(0, 2), `+${lines.length - 2} more`] : lines;
      // The box truncates; the detail panel must still list every update.
      t.detail = { type: "update", name: t.title, text: lines.join("\n") };
    }
  }
  for (const c of t.children) foldUpdates(c.node);
}
