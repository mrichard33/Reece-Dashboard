/**
 * Chain order (2026-09-25): where a workflow sits in the hand-off sequence
 * of its funnel route, from the registry's routes_to / receives_from links.
 * E.2 → S2.1 → S3.1 → S4.1 reads top to bottom instead of alphabetically.
 *
 * Kahn's topological sort per route. Links across routes are ignored (an
 * entry bridge handing to indoctrination is a route change, not a chain
 * position). A cycle (S3.1 ⇄ S3.1-E) is broken by code order. Rows with no
 * link at all get no position; the sorter puts them after the linked ones.
 * Pure and total: never throws, whatever the registry holds.
 */
import type { RouteKey } from "./routes";

export type ChainInput = {
  ghlWorkflowId: string;
  code: string | null;
  route: RouteKey;
  routesTo: readonly string[];
  receivesFrom: readonly string[];
};

export type ChainPosition = { index: number; depth: number };

export function chainOrder(rows: readonly ChainInput[]): Map<string, ChainPosition> {
  const byId = new Map(rows.map((r) => [r.ghlWorkflowId, r]));
  const out = new Map<string, ChainPosition>();
  const routes = new Map<RouteKey, ChainInput[]>();
  for (const r of rows) routes.set(r.route, [...(routes.get(r.route) ?? []), r]);

  const codeOf = (id: string) => byId.get(id)?.code ?? null;
  const byCode = (a: string, b: string) => {
    const ca = codeOf(a);
    const cb = codeOf(b);
    if (ca === null || cb === null) return ca === cb ? 0 : ca === null ? 1 : -1;
    return ca.localeCompare(cb, undefined, { numeric: true });
  };

  for (const group of routes.values()) {
    const ids = new Set(group.map((r) => r.ghlWorkflowId));
    const next = new Map<string, Set<string>>();
    const indeg = new Map<string, number>();
    for (const id of ids) {
      next.set(id, new Set());
      indeg.set(id, 0);
    }
    const link = (from: string, to: string) => {
      if (from === to || !ids.has(from) || !ids.has(to)) return;
      const set = next.get(from)!;
      if (set.has(to)) return;
      set.add(to);
      indeg.set(to, (indeg.get(to) ?? 0) + 1);
    };
    for (const r of group) {
      for (const to of r.routesTo) link(r.ghlWorkflowId, to);
      for (const from of r.receivesFrom) link(from, r.ghlWorkflowId);
    }
    // Only linked rows get a position.
    const linked = new Set<string>();
    for (const [from, tos] of next) {
      if (tos.size) linked.add(from);
      for (const to of tos) linked.add(to);
    }
    if (linked.size === 0) continue;

    const depth = new Map<string, number>();
    let ready = [...linked].filter((id) => (indeg.get(id) ?? 0) === 0).sort(byCode);
    for (const id of ready) depth.set(id, 0);
    const remaining = new Set([...linked].filter((id) => !depth.has(id)));
    let index = 0;
    while (ready.length || remaining.size) {
      if (!ready.length) {
        // Cycle: release the smallest code and carry on.
        const pick = [...remaining].sort(byCode)[0]!;
        remaining.delete(pick);
        depth.set(pick, depth.get(pick) ?? 0);
        ready = [pick];
      }
      const id = ready.shift()!;
      remaining.delete(id);
      out.set(id, { index: index++, depth: depth.get(id) ?? 0 });
      const kids = [...(next.get(id) ?? [])].sort(byCode);
      for (const k of kids) {
        depth.set(k, Math.max(depth.get(k) ?? 0, (depth.get(id) ?? 0) + 1));
        const d = (indeg.get(k) ?? 1) - 1;
        indeg.set(k, d);
        if (d <= 0 && remaining.has(k) && !ready.includes(k)) ready.push(k);
      }
      ready.sort(byCode);
    }
  }
  return out;
}
