import { hlServer, hlService } from "@/lib/supabase/hl";

/**
 * Page Metrics — the two tracked web assets on report.getreecewindows.com:
 *
 *   1. Documented Home Protection Guide (/guide)
 *      page_view · guide_progress (25/50/75/100) · guide_cta_click
 *   2. Weakest Point journey (/ → /find → /unlock → /report)
 *      page_view · gate_start · gate_complete · cta_click ·
 *      video_progress · report_ready
 *
 * Source: HL Supabase `wp_page_events` (separate instance from LP — never
 * join across). Client: service key preferred; anon fallback (migration 010
 * never enabled RLS on wp_page_events, so anon reads succeed) — this keeps
 * the page alive if HL_SUPABASE_SERVICE_KEY is missing on Railway.
 */

export type DailyPoint = {
  day: string; // YYYY-MM-DD (UTC)
  views: number;
  ctaClicks: number;
};

export type GuideMetrics = {
  totalViews: number;
  uniqueSessions: number;
  identifiedContacts: number;
  ctaClicks: number;
  ctaSessions: number;
  /** ctaSessions / uniqueSessions, 0..1 */
  sessionCtr: number;
  scrollReach: { pct25: number; pct50: number; pct75: number; pct100: number };
  daily: DailyPoint[];
};

export type WpJourneyMetrics = {
  /** unique view sessions per step */
  filmSessions: number;
  findSessions: number;
  unlockSessions: number;
  reportSessions: number;
  gateStarts: number;
  gateCompletes: number;
  ctaClicks: number;
  reportsReady: number;
  viewsByPath: { path: string; views: number }[];
  daily: DailyPoint[]; // views = film page views, ctaClicks = film CTA clicks
};

export type PageMetrics = {
  windowDays: number;
  guide: GuideMetrics;
  wp: WpJourneyMetrics;
  identifiedContactsTotal: number;
  error: string | null;
};

type EventRow = {
  event: string;
  path: string | null;
  session_id: string | null;
  contact_id: string | null;
  created_at: string;
  data: { pct?: number } | null;
};

const EMPTY_GUIDE: GuideMetrics = {
  totalViews: 0,
  uniqueSessions: 0,
  identifiedContacts: 0,
  ctaClicks: 0,
  ctaSessions: 0,
  sessionCtr: 0,
  scrollReach: { pct25: 0, pct50: 0, pct75: 0, pct100: 0 },
  daily: [],
};

const EMPTY_WP: WpJourneyMetrics = {
  filmSessions: 0,
  findSessions: 0,
  unlockSessions: 0,
  reportSessions: 0,
  gateStarts: 0,
  gateCompletes: 0,
  ctaClicks: 0,
  reportsReady: 0,
  viewsByPath: [],
  daily: [],
};

function hlClient() {
  try {
    return hlService();
  } catch {
    // Service key not configured — anon fallback (RLS is off on this table)
    return hlServer();
  }
}

function emptyDaily(windowDays: number): DailyPoint[] {
  const daily: DailyPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.push({ day: d, views: 0, ctaClicks: 0 });
  }
  return daily;
}

export async function getPageMetrics(windowDays = 30): Promise<PageMetrics> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  let rows: EventRow[] = [];
  try {
    const hl = hlClient();
    const { data, error } = await hl
      .from("wp_page_events")
      .select("event, path, session_id, contact_id, created_at, data")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .limit(50000);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as EventRow[];
  } catch (err) {
    return {
      windowDays,
      guide: { ...EMPTY_GUIDE, daily: emptyDaily(windowDays) },
      wp: { ...EMPTY_WP, daily: emptyDaily(windowDays) },
      identifiedContactsTotal: 0,
      error: err instanceof Error ? err.message : "HL Supabase query failed",
    };
  }

  // ---- guide accumulators ----
  const gViewSessions = new Set<string>();
  const gCtaSessions = new Set<string>();
  const gContacts = new Set<string>();
  const gScroll: Record<25 | 50 | 75 | 100, Set<string>> = {
    25: new Set(),
    50: new Set(),
    75: new Set(),
    100: new Set(),
  };
  const gDaily = new Map<string, { views: number; ctaClicks: number }>();
  let gViews = 0;
  let gCta = 0;

  // ---- WP journey accumulators ----
  const wpStep: Record<"/" | "/find" | "/unlock" | "/report", Set<string>> = {
    "/": new Set(),
    "/find": new Set(),
    "/unlock": new Set(),
    "/report": new Set(),
  };
  const wpGateStart = new Set<string>();
  const wpGateComplete = new Set<string>();
  const wpCta = new Set<string>();
  const wpReportReady = new Set<string>();
  const wpViewsByPath = new Map<string, number>();
  const wpDaily = new Map<string, { views: number; ctaClicks: number }>();

  const allContacts = new Set<string>();

  // Normalize /guide.html -> /guide etc. so direct-file hits still count
  const normPath = (p: string | null): string => {
    if (!p) return "";
    return p.replace(/\.html$/, "") || "/";
  };

  for (const row of rows) {
    const sid = row.session_id ?? `anon-${row.created_at}`;
    const day = row.created_at.slice(0, 10);
    const path = normPath(row.path);
    if (row.contact_id) allContacts.add(row.contact_id);

    if (path === "/guide") {
      if (!gDaily.has(day)) gDaily.set(day, { views: 0, ctaClicks: 0 });
      const bucket = gDaily.get(day)!;
      if (row.contact_id) gContacts.add(row.contact_id);

      if (row.event === "page_view") {
        gViews += 1;
        bucket.views += 1;
        gViewSessions.add(sid);
      } else if (row.event === "guide_cta_click") {
        gCta += 1;
        bucket.ctaClicks += 1;
        gCtaSessions.add(sid);
      } else if (row.event === "guide_progress") {
        const pct = Number(row.data?.pct);
        if (pct === 25 || pct === 50 || pct === 75 || pct === 100) {
          gScroll[pct].add(sid);
        }
      }
      continue;
    }

    // ---- WP journey (everything not /guide) ----
    if (!wpDaily.has(day)) wpDaily.set(day, { views: 0, ctaClicks: 0 });
    const bucket = wpDaily.get(day)!;

    if (row.event === "page_view") {
      wpViewsByPath.set(path, (wpViewsByPath.get(path) ?? 0) + 1);
      if (path in wpStep) wpStep[path as keyof typeof wpStep].add(sid);
      if (path === "/") bucket.views += 1;
    } else if (row.event === "gate_start") {
      wpGateStart.add(sid);
    } else if (row.event === "gate_complete") {
      wpGateComplete.add(sid);
    } else if (row.event === "cta_click") {
      wpCta.add(sid);
      bucket.ctaClicks += 1;
    } else if (row.event === "report_ready") {
      wpReportReady.add(sid);
    }
  }

  const fillDaily = (
    map: Map<string, { views: number; ctaClicks: number }>,
  ): DailyPoint[] => {
    const daily: DailyPoint[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const bucket = map.get(d);
      daily.push({
        day: d,
        views: bucket?.views ?? 0,
        ctaClicks: bucket?.ctaClicks ?? 0,
      });
    }
    return daily;
  };

  return {
    windowDays,
    guide: {
      totalViews: gViews,
      uniqueSessions: gViewSessions.size,
      identifiedContacts: gContacts.size,
      ctaClicks: gCta,
      ctaSessions: gCtaSessions.size,
      sessionCtr: gViewSessions.size > 0 ? gCtaSessions.size / gViewSessions.size : 0,
      scrollReach: {
        pct25: gScroll[25].size,
        pct50: gScroll[50].size,
        pct75: gScroll[75].size,
        pct100: gScroll[100].size,
      },
      daily: fillDaily(gDaily),
    },
    wp: {
      filmSessions: wpStep["/"].size,
      findSessions: wpStep["/find"].size,
      unlockSessions: wpStep["/unlock"].size,
      reportSessions: wpStep["/report"].size,
      gateStarts: wpGateStart.size,
      gateCompletes: wpGateComplete.size,
      ctaClicks: wpCta.size,
      reportsReady: wpReportReady.size,
      viewsByPath: Array.from(wpViewsByPath.entries())
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views),
      daily: fillDaily(wpDaily),
    },
    identifiedContactsTotal: allContacts.size,
    error: null,
  };
}
