import { lpServer, lpService } from "@/lib/supabase/lp";
import { PILLARS, ARCHETYPES } from "@/components/content/meta";
import type {
  FbPost,
  FbSubtopic,
  FbMessagingPrompt,
  FbMessageBank,
  FbPostEngagement,
  FbPostFeedback,
  FbReasonCode,
} from "@/lib/supabase/types";

const POST_COLUMNS =
  "id, scheduled_date, target, pillar, archetype, post_body, first_comment, image_concept, image_url, subtopic_id, copy_status, image_status, status, revision, needs_manual, approved_by, posted_by, posted_at, fb_permalink, created_at";

const SUBTOPIC_COLUMNS =
  "id, subtopic, pillar, buyer_stage, source, answers_question, source_evidence, status, last_used_at, times_used, created_at";

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

async function loadEngagement(): Promise<FbPostEngagement[]> {
  const supabase = await lpServer();
  const { data, error } = await supabase
    .from("v_fb_post_engagement")
    .select(
      "id, scheduled_date, pillar, archetype, target, status, post_body, posted_at, metric_source, reactions, comments, shares, impressions, reach, link_clicks, pulled_at, engagement_rate",
    );
  if (error) return [];
  return (data ?? []) as unknown as FbPostEngagement[];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function withRate(rows: FbPostEngagement[]): FbPostEngagement[] {
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
  const posted = rows.filter((r) => r.status === "posted");
  const rated = withRate(rows);
  return {
    postsPublished: posted.length,
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
    .select("scheduled_date, status, needs_manual, created_at, posted_at");
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
  }[];
  const drafts = rows.filter((r) => r.status === "draft");
  const created = rows.map((r) => r.created_at).filter(Boolean).sort();
  const posted = rows.map((r) => r.posted_at).filter((d): d is string => !!d).sort();
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
