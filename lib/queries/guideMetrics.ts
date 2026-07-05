import { hlService } from "@/lib/supabase/hl";

/**
 * Guide Metrics — Documented Home Protection Guide (/guide on
 * report.getreecewindows.com, served by the WP static service).
 *
 * Source: HL Supabase `wp_page_events` (separate instance from LP — never
 * join across). Events emitted by the page:
 *   page_view        — every load (identified or anonymous)
 *   guide_progress   — scroll depth milestones 25/50/75/100 (Supabase-only)
 *   guide_cta_click  — Protection Profile Review CTA click
 */

export type GuideDailyPoint = {
  day: string; // YYYY-MM-DD (UTC)
  views: number;
  ctaClicks: number;
};

export type GuideMetrics = {
  windowDays: number;
  totalViews: number;
  uniqueSessions: number;
  identifiedContacts: number;
  ctaClicks: number;
  ctaSessions: number;
  /** ctaSessions / uniqueSessions, 0..1 */
  sessionCtr: number;
  /** sessions reaching each scroll milestone */
  scrollReach: { pct25: number; pct50: number; pct75: number; pct100: number };
  daily: GuideDailyPoint[];
  error: string | null;
};

type EventRow = {
  event: string;
  session_id: string | null;
  contact_id: string | null;
  created_at: string;
  data: { pct?: number } | null;
};

const EMPTY: Omit<GuideMetrics, "windowDays" | "error"> = {
  totalViews: 0,
  uniqueSessions: 0,
  identifiedContacts: 0,
  ctaClicks: 0,
  ctaSessions: 0,
  sessionCtr: 0,
  scrollReach: { pct25: 0, pct50: 0, pct75: 0, pct100: 0 },
  daily: [],
};

export async function getGuideMetrics(windowDays = 30): Promise<GuideMetrics> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  let rows: EventRow[] = [];
  try {
    const hl = hlService();
    const { data, error } = await hl
      .from("wp_page_events")
      .select("event, session_id, contact_id, created_at, data")
      .eq("path", "/guide")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as EventRow[];
  } catch (err) {
    return {
      windowDays,
      ...EMPTY,
      error: err instanceof Error ? err.message : "HL Supabase query failed",
    };
  }

  const viewSessions = new Set<string>();
  const ctaSessions = new Set<string>();
  const contacts = new Set<string>();
  const scrollSessions: Record<25 | 50 | 75 | 100, Set<string>> = {
    25: new Set(),
    50: new Set(),
    75: new Set(),
    100: new Set(),
  };
  const dailyMap = new Map<string, { views: number; ctaClicks: number }>();

  let totalViews = 0;
  let ctaClicks = 0;

  for (const row of rows) {
    const sid = row.session_id ?? `anon-${row.created_at}`;
    const day = row.created_at.slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, { views: 0, ctaClicks: 0 });
    const bucket = dailyMap.get(day)!;

    if (row.contact_id) contacts.add(row.contact_id);

    if (row.event === "page_view") {
      totalViews += 1;
      bucket.views += 1;
      viewSessions.add(sid);
    } else if (row.event === "guide_cta_click") {
      ctaClicks += 1;
      bucket.ctaClicks += 1;
      ctaSessions.add(sid);
    } else if (row.event === "guide_progress") {
      const pct = Number(row.data?.pct);
      if (pct === 25 || pct === 50 || pct === 75 || pct === 100) {
        scrollSessions[pct].add(sid);
      }
    }
  }

  // Fill missing days so charts render a continuous window
  const daily: GuideDailyPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const bucket = dailyMap.get(d);
    daily.push({ day: d, views: bucket?.views ?? 0, ctaClicks: bucket?.ctaClicks ?? 0 });
  }

  const uniqueSessions = viewSessions.size;

  return {
    windowDays,
    totalViews,
    uniqueSessions,
    identifiedContacts: contacts.size,
    ctaClicks,
    ctaSessions: ctaSessions.size,
    sessionCtr: uniqueSessions > 0 ? ctaSessions.size / uniqueSessions : 0,
    scrollReach: {
      pct25: scrollSessions[25].size,
      pct50: scrollSessions[50].size,
      pct75: scrollSessions[75].size,
      pct100: scrollSessions[100].size,
    },
    daily,
    error: null,
  };
}
