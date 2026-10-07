/**
 * "Every message" grouped by route (2026-10-07).
 *
 * The tab used to be one list sorted by send time, with a grey "if: Path A"
 * under some rows in GHL's raw node names. On F.0 (20 decisions, an A/B test
 * behind a "has a rep name" check) nobody could tell which texts a lead
 * actually gets together. Now each route (the forks taken to reach a message,
 * worded like the flowchart's arrows) is its own section, in flowchart order,
 * with its messages in send order. A route that runs into steps another route
 * already reached says where it carries on, because each message is still
 * listed once.
 *
 * Only a REAL fork makes a route: one where at least two sides send messages
 * (rep name or not, A/B Path A or B). F.0 guards almost every message with a
 * "has an email?" check and a "wait until the pause ends, or give up after
 * 30 days" — one side of each sends nothing — and counting those made F.0's
 * every message its own route, 18 of them, each a dozen lines long. Such a
 * one-sided check is shown on the message instead ("only if: has email").
 */
import { routeKey, type RouteJoin, type RouteStep, type ScheduleRow } from "@/lib/journey/workflowGraph";

export type RouteContinuation = {
  /** The forks after the group's own route that lead to the jump (empty = straight on). */
  when: RouteStep[];
  atLabel: string;
  /** Route numbers that hold what comes next; includes this group's own number for a loop. */
  routeNumbers: number[];
  /** The jump lands back on this same route (a repeat loop). */
  loop: boolean;
};

export type RouteGroup = {
  key: string;
  /** 0 = the messages everyone gets before the first fork; otherwise 1, 2, 3… */
  number: number;
  /** The forks, minus the shared start every message has in common. */
  route: RouteStep[];
  /**
   * The route this one branches off (its longest prefix that has messages), or
   * null. The header then shows only the forks after it, so a route six levels
   * deep reads "after Route 6: Rep First Name → No Rep First Name".
   */
  after: number | null;
  /** The forks after `after` (or all of `route` when there is no parent). */
  newSteps: RouteStep[];
  rows: ScheduleRow[];
  continues: RouteContinuation[];
  /** The routes that fork off right after this one's messages ("then splits: Route 5, Route 10"). */
  splitsInto: { number: number; via: RouteStep }[];
};

export type ScheduleRoutes = {
  shared: RouteStep[];
  groups: RouteGroup[];
  /** stepId → the one-sided checks passed since the previous message ("has email"). */
  onlyIf: Record<string, string[]>;
};

const same = (a: RouteStep, b: RouteStep) => a.forkId === b.forkId && a.pathId === b.pathId;

function startsWith(route: readonly RouteStep[], prefix: readonly RouteStep[]): boolean {
  return prefix.length <= route.length && prefix.every((p, i) => same(p, route[i]!));
}

function commonPrefix(routes: readonly (readonly RouteStep[])[]): RouteStep[] {
  if (routes.length < 2) return [];
  const out: RouteStep[] = [];
  for (let i = 0; ; i++) {
    const v = routes[0]![i];
    if (!v || routes.some((r) => !r[i] || !same(r[i]!, v))) return out;
    out.push(v);
  }
}

export function groupScheduleByRoute(allRows: readonly ScheduleRow[], joins: readonly RouteJoin[] = []): ScheduleRoutes {
  // A fork is real when messages sit behind two or more of its sides.
  const sides = new Map<string, Set<string>>();
  for (const r of allRows) for (const s of r.route) (sides.get(s.forkId) ?? sides.set(s.forkId, new Set()).get(s.forkId)!).add(s.pathId);
  const real = (s: RouteStep) => (sides.get(s.forkId)?.size ?? 0) >= 2;
  // The same check asked again further down (F.0 asks "rep first name?" before
  // each of its texts) gets the same answer, so it says nothing new: the first
  // one stands for it, and the routes it would split merge back together.
  const realOf = (route: readonly RouteStep[]) => {
    const seen = new Set<string>();
    return route.filter(real).filter((s) => {
      const k = `${s.decision}\u0000${s.answer}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // One-sided checks since the previous message on the same path.
  const onlyIf: Record<string, string[]> = {};
  const byWalk = [...allRows].sort((a, b) => a.walkOrder - b.walkOrder);
  for (const m of byWalk) {
    let prev: ScheduleRow | undefined;
    for (const p of byWalk) {
      if (p.walkOrder >= m.walkOrder) break;
      if (startsWith(m.route, p.route) && (!prev || p.route.length >= prev.route.length)) prev = p;
    }
    const checks = m.route
      .slice(prev ? prev.route.length : 0)
      .filter((s) => !real(s) && (s.kind === "condition" || s.answer !== "when it happens"))
      .map(guardWords);
    if (checks.length) onlyIf[m.stepId] = [...new Set(checks)];
  }

  const rows = allRows.map((r) => ({ row: r, route: realOf(r.route) }));
  const shared = commonPrefix(rows.map((r) => r.route));

  const byKey = new Map<string, { route: RouteStep[]; rows: ScheduleRow[]; first: number }>();
  for (const { row, route } of rows) {
    const k = routeKey(route);
    const g = byKey.get(k) ?? { route, rows: [], first: row.walkOrder };
    g.rows.push(row);
    g.first = Math.min(g.first, row.walkOrder);
    byKey.set(k, g);
  }

  const ordered = [...byKey.entries()].sort((a, b) => a[1].first - b[1].first);
  const sharedKey = routeKey(shared);
  let n = 0;
  const groups: (RouteGroup & { full: RouteStep[] })[] = ordered.map(([key, g]) => ({
    key,
    number: key === sharedKey ? 0 : ++n,
    route: g.route.slice(shared.length),
    full: g.route,
    rows: [...g.rows].sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.walkOrder - b.walkOrder),
    continues: [],
    splitsInto: [],
    after: null,
    newSteps: g.route.slice(shared.length),
  }));

  for (const g of groups) {
    let parent: (typeof groups)[number] | undefined;
    for (const h of groups) {
      if (h !== g && h.full.length < g.full.length && startsWith(g.full, h.full) && (!parent || h.full.length > parent.full.length)) parent = h;
    }
    if (parent && parent.number > 0) {
      g.after = parent.number;
      g.newSteps = g.full.slice(parent.full.length);
    }
  }

  // Direct children: longer routes that start with this one, with no route in between.
  for (const g of groups) {
    const below = groups.filter((h) => h !== g && h.full.length > g.full.length && startsWith(h.full, g.full));
    for (const h of below) {
      if (below.some((m) => m !== h && m.full.length < h.full.length && startsWith(h.full, m.full))) continue;
      g.splitsInto.push({ number: h.number, via: h.full[g.full.length]! });
    }
  }

  for (const j of joins) {
    const from = realOf(j.route);
    const to = realOf(j.toRoute);
    // A jump that stays on its own route (a "No Email" side skipping ahead to
    // the next wait) is not news: the route's list already reads on.
    if (routeKey(from) === routeKey(to)) continue;
    // The group the jump belongs to: the longest route the jump's route starts with.
    let owner: (typeof groups)[number] | undefined;
    for (const g of groups) if (startsWith(from, g.full) && (!owner || g.full.length > owner.full.length)) owner = g;
    if (!owner) continue;
    // Where it lands: the route that first reached that step, or the routes that branch out from it.
    const exact = groups.filter((g) => routeKey(g.full) === routeKey(to));
    const targets = exact.length ? exact : groups.filter((g) => startsWith(g.full, to));
    if (targets.length === 0) continue; // lands where nothing more is sent
    const loop = targets.some((t) => t === owner);
    const c: RouteContinuation = { when: from.slice(owner.full.length), atLabel: j.atLabel, routeNumbers: targets.map((t) => t.number), loop };
    if (!owner.continues.some((x) => x.atLabel === c.atLabel && routeKey(x.when) === routeKey(c.when))) owner.continues.push(c);
  }

  return {
    shared,
    groups: groups.map((g) => ({
      key: g.key,
      number: g.number,
      route: g.route,
      after: g.after,
      newSteps: g.newSteps,
      rows: g.rows,
      continues: g.continues,
      splitsInto: g.splitsInto,
    })),
    onlyIf,
  };
}

/** "has email" from "Email Exist · has email"; a wait's give-up side keeps its wait. */
function guardWords(s: RouteStep): string {
  if (s.kind === "wait") return `${s.decision} — ${s.answer}`;
  const i = s.answer.indexOf(" · ");
  const words = i >= 0 ? s.answer.slice(i + 3) : "";
  // "none of the above" means nothing without the question it answers.
  if (words && words !== "none of the above") return words;
  return `${s.decision.replace(/^If: /, "")}: ${i >= 0 ? s.answer.slice(0, i) : s.answer}`;
}

/** "Route 2" / "Everyone" for a number from groupScheduleByRoute. */
export function routeName(n: number): string {
  return n === 0 ? "Everyone" : `Route ${n}`;
}
