import { hlService } from "@/lib/supabase/hl";

// ── Config ───────────────────────────────────────────────────────────────────
// Statuses to include. Default open-only: in Reece's GHL, opps keep status
// 'open' as they move through every stage (including terminal ones like
// Reactivation / Long-Term Hold / Do Not Contact), so open-only still populates
// every stage while excluding the won/lost/abandoned archive. To show the full
// archive, add 'won','lost','abandoned'.
const INCLUDE_STATUSES = ["open"] as const;

// Opps with no GHL update in > STUCK_DAYS are "stuck" and tint red.
const STUCK_DAYS = 14;

// PostgREST caps one response at 1000 rows. There are ~5.5k open opps, so we
// MUST paginate or counts silently truncate at 1000.
const PAGE_SIZE = 1000;
const DAY_MS = 86_400_000;

// Only the columns the bars + metrics need. Aging uses date_added/date_updated
// (GHL-native). created_at is a fallback only; never the cache-side updated_at.
type OppRow = {
  ghl_pipeline_id: string;
  ghl_stage_id: string | null;
  monetary_value: number | null;
  date_added: string | null;
  date_updated: string | null;
  created_at: string | null;
};

type StageJson = { id: string; name: string; position: number };

type PipelineRow = {
  id: string;
  ghl_pipeline_id: string;
  name: string;
  stages: StageJson[] | null;
};

export type PipelineStageDatum = {
  id: string;
  name: string;
  position: number;
  count: number;
  value: number;
  /** avg days since last GHL update — drives the aging tint ("aging in stage"). */
  avgAgeDays: number;
};

export type PipelineCard = {
  id: string;
  ghlPipelineId: string;
  /** "P1" | "P2" | … by final sort position. */
  badge: string;
  order: number;
  name: string;
  count: number;
  totalValue: number;
  /** avg days since the opp was created in GHL (date_added) — "cycle time". */
  avgCycleDays: number;
  /** # opps with no GHL update in > STUCK_DAYS. */
  stuckCount: number;
  /** most recent GHL update across the pipeline's opps (ISO) or null. */
  lastAdvanceAt: string | null;
  stages: PipelineStageDatum[];
};

function tsMs(s: string | null): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}
/** Best "last activity" instant: date_updated → date_added → created_at. */
function idleAnchor(o: OppRow): number | null {
  return tsMs(o.date_updated) ?? tsMs(o.date_added) ?? tsMs(o.created_at);
}
/** Best "created" instant: date_added → created_at. */
function ageAnchor(o: OppRow): number | null {
  return tsMs(o.date_added) ?? tsMs(o.created_at);
}
/** Leading integer in "1. Antifragile…" → 1; null if none. */
function leadingOrder(name: string): number | null {
  const m = name.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

async function fetchOpenOpps(): Promise<OppRow[]> {
  const sb = hlService();
  const rows: OppRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from("opportunities")
      .select(
        "ghl_pipeline_id, ghl_stage_id, monetary_value, date_added, date_updated, created_at",
      )
      .is("deleted_at", null)
      .in("status", [...INCLUDE_STATUSES])
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as OppRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getPipelineCards(): Promise<PipelineCard[]> {
  const sb = hlService();

  const [pipesRes, opps] = await Promise.all([
    sb
      .from("pipelines")
      .select("id, ghl_pipeline_id, name, stages")
      .is("deleted_at", null),
    fetchOpenOpps(),
  ]);

  if (pipesRes.error) throw pipesRes.error;
  const pipelines = (pipesRes.data ?? []) as PipelineRow[];

  const byPipeline = new Map<string, OppRow[]>();
  for (const o of opps) {
    const arr = byPipeline.get(o.ghl_pipeline_id);
    if (arr) arr.push(o);
    else byPipeline.set(o.ghl_pipeline_id, [o]);
  }

  const now = Date.now();

  const cards: PipelineCard[] = pipelines.map((p) => {
    const stageDefs = (p.stages ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const stageIds = new Set(stageDefs.map((s) => s.id));

    // Only opps that map to a known stage, so header count == bar == metrics.
    const known = (byPipeline.get(p.ghl_pipeline_id) ?? []).filter(
      (o) => o.ghl_stage_id !== null && stageIds.has(o.ghl_stage_id),
    );

    const stages: PipelineStageDatum[] = stageDefs.map((s) => {
      const sOpps = known.filter((o) => o.ghl_stage_id === s.id);
      let idleSum = 0;
      let idleN = 0;
      for (const o of sOpps) {
        const a = idleAnchor(o);
        if (a !== null) {
          idleSum += (now - a) / DAY_MS;
          idleN += 1;
        }
      }
      return {
        id: s.id,
        name: s.name,
        position: s.position,
        count: sOpps.length,
        value: sOpps.reduce((acc, o) => acc + (o.monetary_value ?? 0), 0),
        avgAgeDays: idleN === 0 ? 0 : Math.round(idleSum / idleN),
      };
    });

    let ageSum = 0;
    let ageN = 0;
    let stuckCount = 0;
    let lastAdvance = 0;
    for (const o of known) {
      const age = ageAnchor(o);
      if (age !== null) {
        ageSum += (now - age) / DAY_MS;
        ageN += 1;
      }
      const idle = idleAnchor(o);
      if (idle !== null) {
        if ((now - idle) / DAY_MS > STUCK_DAYS) stuckCount += 1;
        if (idle > lastAdvance) lastAdvance = idle;
      }
    }

    return {
      id: p.id,
      ghlPipelineId: p.ghl_pipeline_id,
      order: leadingOrder(p.name) ?? Number.MAX_SAFE_INTEGER,
      badge: "",
      name: p.name,
      count: known.length,
      totalValue: known.reduce((acc, o) => acc + (o.monetary_value ?? 0), 0),
      avgCycleDays: ageN === 0 ? 0 : Math.round(ageSum / ageN),
      stuckCount,
      lastAdvanceAt:
        lastAdvance === 0 ? null : new Date(lastAdvance).toISOString(),
      stages,
    };
  });

  cards.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name),
  );
  cards.forEach((c, i) => {
    c.badge = `P${i + 1}`;
  });

  return cards;
}
