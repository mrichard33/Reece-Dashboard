import { lpServer, lpService } from "@/lib/supabase/lp";
import { PILLARS, ARCHETYPES } from "@/components/content/meta";
import type {
  FbPost,
  FbContentPlan,
  FbSubtopic,
  FbMessagingPrompt,
  FbMessageBank,
  FbPostEngagement,
  FbPostFeedback,
  FbReasonCode,
} from "@/lib/supabase/types";

const POST_COLUMNS =
  "id, scheduled_date, target, pillar, archetype, post_body, first_comment, image_concept, image_url, subtopic_id, copy_status, image_status, status, revision, needs_manual, approved_by, posted_by, posted_at, fb_permalink, created_at, page_posted_at, page_permalink, publish_attempts, last_publish_error, scheduled_time, publish_at";

const PLAN_COLUMNS =
  "id, plan_date, pillar, archetype, subtopic_id, campaign, status, created_at";

const SUBTOPIC_COLUMNS =
  "id, subtopic, pillar, buyer_stage, source, answers_question, source_evidence, status, last_used_at, times_used, created_at";

// ── Generation tuning (fb_settings → env fallback → hardcoded default) ─────────

/** Hardcoded defaults, used when neither the DB column nor the env var is set. */
const TUNING_DEFAULTS = {
  max_regen_attempts: 3,
  max_per_generation: 7,
  plan_horizon_days: 30,
  generation_buffer_days: 3,
} as const;

export type TuningKey = keyof typeof TUNING_DEFAULTS;

const TUNING_ENV: Record<TuningKey, string> = {
  max_regen_attempts: "MAX_REGEN_ATTEMPTS",
  max_per_generation: "MAX_PER_GENERATION",
  plan_horizon_days: "PLAN_HORIZON_DAYS",
  generation_buffer_days: "GENERATION_BUFFER_DAYS",
};

export type TuningFieldInfo = {
  key: TuningKey;
  /** Effective value (DB ?? env ?? default). */
  value: number;
  /** Raw DB column (null = falling back). */
  dbValue: number | null;
  /** What `value` would be if the DB column is null (env, else default). */
  envFallback: number;
  source: "db" | "env" | "default";
};

export type FbTuning = {
  maxRegenAttempts: number;
  maxPerGeneration: number;
  planHorizonDays: number;
  generationBufferDays: number;
  /** "HH:MM" Eastern, or null = publish on approval (no default post time). */
  defaultPostTime: string | null;
  /** Per-field provenance for the Content Settings tuning card. */
  fields: TuningFieldInfo[];
};

function parseEnvInt(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

function resolveTuningField(key: TuningKey, dbValue: number | null): TuningFieldInfo {
  const env = parseEnvInt(TUNING_ENV[key]);
  const envFallback = env ?? TUNING_DEFAULTS[key];
  if (dbValue !== null) {
    return { key, value: dbValue, dbValue, envFallback, source: "db" };
  }
  return {
    key,
    value: envFallback,
    dbValue: null,
    envFallback,
    source: env !== null ? "env" : "default",
  };
}

/**
 * Effective generation tuning, read per-call (not at module load) so a UI save
 * to fb_settings takes effect on the next action without a redeploy. Resolution
 * order per field: DB column → env var → hardcoded default. `default_post_time`
 * has no env fallback (it's a dashboard-only setting).
 *
 * Read via lpServer so RLS applies; on any error fall back to env/defaults so the
 * content engine never hard-fails on a settings read.
 */
export async function getFbTuning(): Promise<FbTuning> {
  let row: Record<string, unknown> | null = null;
  try {
    const supabase = await lpServer();
    const { data } = await supabase
      .from("fb_settings")
      .select(
        "default_post_time, max_regen_attempts, max_per_generation, plan_horizon_days, generation_buffer_days",
      )
      .eq("id", 1)
      .maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  } catch {
    row = null;
  }

  const dbInt = (key: TuningKey): number | null => {
    const v = row?.[key];
    return typeof v === "number" ? v : null;
  };

  const fields: TuningFieldInfo[] = (
    Object.keys(TUNING_DEFAULTS) as TuningKey[]
  ).map((k) => resolveTuningField(k, dbInt(k)));

  const byKey = (k: TuningKey) => fields.find((f) => f.key === k)!.value;

  const rawTime = row?.default_post_time;
  const defaultPostTime =
    typeof rawTime === "string" && rawTime.length > 0 ? rawTime.slice(0, 5) : null;

  return {
    maxRegenAttempts: byKey("max_regen_attempts"),
    maxPerGeneration: byKey("max_per_generation"),
    planHorizonDays: byKey("plan_horizon_days"),
    generationBufferDays: byKey("generation_buffer_days"),
    defaultPostTime,
    fields,
  };
}

/**
 * Cheap probe: are the content-engine tables present? Lets pages show a setup
 * banner instead of silently-empty UI when migrations 0003/0004 aren't applied.
 */
export async function contentEngineReady(): Promise<boolean> {
  const supabase = await lpServer();
  const { error } = await supabase
    .from("fb_posts")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  return !error;
}

// ── Calendar ──────────────────────────────────────────────────────

/** Posts whose scheduled_date falls in [startDate, endDate] (ISO yyyy-MM-dd). */
export async function listPostsForRange(
  startDate: string,
  endDate: string,
): Promise<FbPost[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_posts")
    .select(POST_COLUMNS)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("scheduled_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[content] listPostsForRange:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbPost[];
}

/**
 * Planned slots whose plan_date falls in [startDate, endDate] (ISO yyyy-MM-dd).
 * Empty-safe (the table arrives with migration 0005). 'generated' slots already
 * have an fb_posts row, so the calendar only surfaces 'planned'/'skipped' from here.
 */
export async function listPlanForRange(
  startDate: string,
  endDate: string,
): Promise<FbContentPlan[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_content_plan")
    .select(PLAN_COLUMNS)
    .gte("plan_date", startDate)
    .lte("plan_date", endDate)
    .order("plan_date", { ascending: true });
  if (error) {
    console.error("[content] listPlanForRange:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbContentPlan[];
}

export async function getPost(id: string): Promise<FbPost | null> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_posts")
    .select(POST_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[content] getPost:", error.message);
    return null;
  }
  return (data as unknown as FbPost) ?? null;
}

export async function getPostFeedback(postId: string): Promise<FbPostFeedback[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_post_feedback")
    .select(
      "id, post_id, component, reason_code, reason_text, rejected_snapshot, rejected_by, created_at",
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[content] getPostFeedback:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbPostFeedback[];
}

/** "Needs Approval" = drafts (every draft has at least one non-approved component). */
export async function needsApprovalCount(): Promise<number> {
  const supabase = await lpServer();
  const { count, error } = await supabase
    .from("fb_posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft");
  if (error) return 0;
  return count ?? 0;
}

// ── Idea Miner ────────────────────────────────────────────────────

export async function listProposals(): Promise<FbSubtopic[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_subtopics")
    .select(SUBTOPIC_COLUMNS)
    .eq("status", "proposed")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[content] listProposals:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbSubtopic[];
}

export async function listSubtopics(): Promise<FbSubtopic[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_subtopics")
    .select(SUBTOPIC_COLUMNS)
    .neq("status", "proposed")
    .order("pillar", { ascending: true })
    .order("times_used", { ascending: true });
  if (error) {
    console.error("[content] listSubtopics:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbSubtopic[];
}

/** Count of ACTIVE subtopics per pillar (the coverage strip). */
export async function pillarCoverage(): Promise<{ pillar: string; count: number }[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_subtopics")
    .select("pillar")
    .eq("status", "active");
  if (error) return PILLARS.map((pillar) => ({ pillar, count: 0 }));
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { pillar: string }[]) {
    counts.set(row.pillar, (counts.get(row.pillar) ?? 0) + 1);
  }
  return PILLARS.map((pillar) => ({ pillar, count: counts.get(pillar) ?? 0 }));
}

// ── Message Bank ──────────────────────────────────────────────────

export async function getMessageBank(): Promise<FbMessageBank | null> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_message_bank")
    .select("id, variables, version, segment, is_active, created_at")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[content] getMessageBank:", error.message);
    return null;
  }
  return (data as unknown as FbMessageBank) ?? null;
}

export async function getPrompts(): Promise<FbMessagingPrompt[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_messaging_prompts")
    .select("id, name, body, version, is_active, created_at")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("[content] getPrompts:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FbMessagingPrompt[];
}

// ── Insights ──────────────────────────────────────────────────────
// Read the v_fb_post_engagement view and aggregate in JS (small dataset;
// supabase-js can't GROUP BY). Every result is empty-safe.
//
// Two-leg publish model: WF4 Page publishes set page_posted_at and leave
// status='approved' (the Group leg is manual). A post counts as PUBLISHED
// when status='posted' OR page_posted_at is set.

type EngagementRow = FbPostEngagement & {
  page_posted_at: string | null;
  page_permalink: string | null;
};

async function loadEngagement(): Promise<EngagementRow[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("v_fb_post_engagement")
    .select(
      "id, scheduled_date, pillar, archetype, target, status, post_body, posted_at, metric_source, reactions, comments, shares, impressions, reach, link_clicks, pulled_at, engagement_rate, page_posted_at, page_permalink",
    );
  if (error) return [];
  return (data ?? []) as unknown as EngagementRow[];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function withRate(rows: EngagementRow[]): EngagementRow[] {
  return rows.filter((r) => r.engagement_rate !== null && (r.reach ?? 0) > 0);
}

export type InsightsTopline = {
  postsPublished: number;
  avgEngagementRate: number | null;
  totalReach: number;
  totalImpressions: number;
  totalReactions: number;
};

export async function getInsightsTopline(): Promise<InsightsTopline> {
  const rows = await loadEngagement();
  const published = rows.filter(
    (r) => r.status === "posted" || r.page_posted_at !== null,
  );
  const rated = withRate(rows);
  return {
    postsPublished: published.length,
    avgEngagementRate: avg(rated.map((r) => r.engagement_rate as number)),
    totalReach: rows.reduce((a, r) => a + (r.reach ?? 0), 0),
    totalImpressions: rows.reduce((a, r) => a + (r.impressions ?? 0), 0),
    totalReactions: rows.reduce((a, r) => a + (r.reactions ?? 0), 0),
  };
}

export async function getEngagementByPillar(): Promise<
  { pillar: string; engagementRate: number | null; posts: number }[]
> {
  const rated = withRate(await loadEngagement());
  return PILLARS.map((pillar) => {
    const subset = rated.filter((r) => r.pillar === pillar);
    return {
      pillar,
      engagementRate: avg(subset.map((r) => r.engagement_rate as number)),
      posts: subset.length,
    };
  });
}

export async function getEngagementByArchetype(): Promise<
  { archetype: string; engagementRate: number | null; posts: number }[]
> {
  const rated = withRate(await loadEngagement());
  return ARCHETYPES.map((archetype) => {
    const subset = rated.filter((r) => r.archetype === archetype);
    return {
      archetype,
      engagementRate: avg(subset.map((r) => r.engagement_rate as number)),
      posts: subset.length,
    };
  });
}

export async function getEngagementTrend(): Promise<
  { date: string; engagementRate: number }[]
> {
  const rated = withRate(await loadEngagement());
  const byDate = new Map<string, number[]>();
  for (const r of rated) {
    const arr = byDate.get(r.scheduled_date) ?? [];
    arr.push(r.engagement_rate as number);
    byDate.set(r.scheduled_date, arr);
  }
  return [...byDate.entries()]
    .map(([date, vals]) => ({ date, engagementRate: avg(vals) ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type RankedPost = {
  id: string;
  scheduled_date: string;
  pillar: string | null;
  archetype: string | null;
  engagementRate: number;
  reach: number;
};

export async function getTopBottomPosts(): Promise<{
  top: RankedPost[];
  bottom: RankedPost[];
}> {
  const rated = withRate(await loadEngagement())
    .map((r) => ({
      id: r.id,
      scheduled_date: r.scheduled_date,
      pillar: r.pillar,
      archetype: r.archetype,
      engagementRate: r.engagement_rate as number,
      reach: r.reach ?? 0,
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate);
  return { top: rated.slice(0, 10), bottom: rated.slice(-5).reverse() };
}

export async function getRejectionsByReason(): Promise<
  { reason_code: string; copy: number; image: number }[]
> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("fb_post_feedback")
    .select("reason_code, component");
  if (error) return [];
  const rows = (data ?? []) as { reason_code: FbReasonCode; component: string }[];
  const byReason = new Map<string, { copy: number; image: number }>();
  for (const r of rows) {
    const cur = byReason.get(r.reason_code) ?? { copy: 0, image: 0 };
    if (r.component === "image") cur.image += 1;
    else cur.copy += 1; // 'copy' and 'both' count toward copy
    byReason.set(r.reason_code, cur);
  }
  return [...byReason.entries()].map(([reason_code, v]) => ({ reason_code, ...v }));
}

export type OpsHealth = {
  draftsAhead: number;
  pendingApproval: number;
  needsManual: number;
  lastGeneratedAt: string | null;
  lastPostedAt: string | null;
};

export async function getOpsHealth(): Promise<OpsHealth> {
  const supabase = await lpServer();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("fb_posts")
    .select("scheduled_date, status, needs_manual, created_at, posted_at, page_posted_at");
  if (error) {
    return {
      draftsAhead: 0,
      pendingApproval: 0,
      needsManual: 0,
      lastGeneratedAt: null,
      lastPostedAt: null,
    };
  }
  const rows = (data ?? []) as {
    scheduled_date: string;
    status: string;
    needs_manual: boolean;
    created_at: string;
    posted_at: string | null;
    page_posted_at: string | null;
  }[];
  const drafts = rows.filter((r) => r.status === "draft");
  const created = rows.map((r) => r.created_at).filter(Boolean).sort();
  const posted = rows
    .flatMap((r) => [r.posted_at, r.page_posted_at])
    .filter((d): d is string => !!d)
    .sort();
  return {
    draftsAhead: rows.filter((r) => r.status === "approved" && r.scheduled_date >= today).length,
    pendingApproval: drafts.length,
    needsManual: rows.filter((r) => r.needs_manual).length,
    lastGeneratedAt: created.length ? (created[created.length - 1] ?? null) : null,
    lastPostedAt: posted.length ? (posted[posted.length - 1] ?? null) : null,
  };
}

// ── Funnel / group growth (GHL) ───────────────────────────────────
// Reads the GHL contact-tag snapshot (a cross-feature table) via the service role.
// Populated by Mark's §11 opt-in funnel; until that tags contacts, the opt-in tag
// has 0 members. Landing-page views are NOT synced anywhere, so the opt-in RATE
// and the full landing→opt-in→join funnel can't be computed — the UI marks those
// "not tracked yet" rather than invent a source. Empty-safe.

export type FunnelKpis = {
  optInTag: string;
  available: boolean; // false if the snapshot table can't be read
  groupMembers: number; // contacts carrying the opt-in tag
  newLast30: number; // tagged/updated within the last 30 days (proxy via updated_at)
  growth: { date: string; total: number }[]; // cumulative members over time
};

export async function getFunnelKpis(): Promise<FunnelKpis> {
  const optInTag = process.env.FB_GROUP_OPTIN_TAG ?? "fb-group-optin";
  const empty: FunnelKpis = { optInTag, available: false, groupMembers: 0, newLast30: 0, growth: [] };

  let svc: ReturnType<typeof lpService>;
  try {
    svc = lpService();
  } catch {
    return empty; // service env unset — degrade quietly
  }

  const { data, error } = await svc
    .from("contact_tag_snapshot")
    .select("updated_at")
    .contains("tags", [optInTag]);
  if (error) {
    console.error("[content] getFunnelKpis:", error.message);
    return empty;
  }

  const rows = (data ?? []) as { updated_at: string | null }[];
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.updated_at) continue;
    const day = r.updated_at.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  let running = 0;
  const growth = [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, n]) => ({ date, total: (running += n) }));

  return {
    optInTag,
    available: true,
    groupMembers: rows.length,
    newLast30: rows.filter((r) => r.updated_at && r.updated_at >= cutoff).length,
    growth,
  };
}
