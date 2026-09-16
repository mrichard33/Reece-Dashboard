import { hlServer, hlService } from "@/lib/supabase/hl";

/**
 * Calculator Funnel — the estimate calculator at reecewindows.com/window-estimate.
 *
 * Source: HL Supabase `estimator_events` (separate instance from LP — never
 * join across). This is a DIFFERENT table from `wp_page_events`, which feeds
 * the Guide and Weakest Point sections on this same page: the calculator is a
 * self-hosted Express app on Railway and posts its own first-party events, so
 * it never went through the WP tracking script.
 *
 * Event vocabulary, verified against the live table on 2026-09-16 rather than
 * against the handoff doc:
 *   page_view · step1_complete · window_added · step3_complete ·
 *   estimate_completed · verify_sent · verify_success
 *
 * `verify_cta_clicked` WAS counted here and has never been emitted — zero rows
 * since the table was created. It was a funnel stage that could only ever show
 * zero, so the screen reported that nobody asks for exact pricing while the
 * data showed eight sessions completing verification. A stage that is
 * structurally zero and a stage where nothing happened must not look the same,
 * so it is gone rather than left in place.
 *
 * `verify_sent` and `verify_success` carry the real signal: the code went out,
 * and the homeowner entered it. Those two answer "does email verification
 * work", which is what the removed stage was there to ask.
 *
 * `estimate_completed` carries payload.estimate_total, used for the average.
 *
 * Client: service key preferred, anon fallback — matching guideMetrics, so the
 * section survives a missing HL_SUPABASE_SERVICE_KEY on Railway rather than
 * taking the whole page down.
 */

export type CalcDailyPoint = {
  day: string; // YYYY-MM-DD (UTC)
  views: number;
  /**
   * Verification codes sent that day. The field keeps the `ctaClicks` name
   * because `DailyPoint` is shared with the Guide and Weakest Point charts and
   * their accent series really is a CTA click; only the calculator's source
   * event changed. The chart labels itself, so nothing on screen says "CTA".
   */
  ctaClicks: number;
};

export type CalcSourceRow = {
  source: string;
  views: number;
  step1: number;
  estimates: number;
  /** Sessions that entered the code and were verified. */
  verified: number;
  /** estimates / views, 0..1 */
  completionRate: number;
};

export type CalculatorMetrics = {
  windowDays: number;
  /** Unique sessions reaching each funnel step. */
  funnel: {
    pageViews: number;
    step1: number;
    windowAdded: number;
    step3: number;
    estimates: number;
    /** Verification codes sent. */
    verifySent: number;
    /** Codes entered successfully — the end of the funnel. */
    verified: number;
  };
  identifiedContacts: number;
  avgEstimateTotal: number | null;
  /** estimates / pageViews, 0..1 */
  completionRate: number;
  /** estimates / step1 — of those who gave contact details, who saw a price. */
  step1ToEstimate: number;
  bySource: CalcSourceRow[];
  daily: CalcDailyPoint[];
  error: string | null;
};

type CalcEventRow = {
  session_id: string | null;
  contact_id: string | null;
  event_type: string;
  payload: { estimate_total?: number | string } | null;
  utm_source: string | null;
  created_at: string;
};

/**
 * Funnel steps in order. Exported so the vocabulary can be tested against what
 * the table actually contains — this list silently carried a stage that is
 * never emitted, and nothing caught it.
 */
export const STEPS = [
  "page_view",
  "step1_complete",
  "window_added",
  "step3_complete",
  "estimate_completed",
  "verify_sent",
  "verify_success",
] as const;
type Step = (typeof STEPS)[number];

function hlClient() {
  try {
    return hlService();
  } catch {
    // Service key not configured — anon fallback, same posture as guideMetrics.
    return hlServer();
  }
}

function emptyDaily(windowDays: number): CalcDailyPoint[] {
  const daily: CalcDailyPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    daily.push({ day: d, views: 0, ctaClicks: 0 });
  }
  return daily;
}

function emptyMetrics(windowDays: number, error: string | null): CalculatorMetrics {
  return {
    windowDays,
    funnel: {
      pageViews: 0,
      step1: 0,
      windowAdded: 0,
      step3: 0,
      estimates: 0,
      verifySent: 0,
      verified: 0,
    },
    identifiedContacts: 0,
    avgEstimateTotal: null,
    completionRate: 0,
    step1ToEstimate: 0,
    bySource: [],
    daily: emptyDaily(windowDays),
    error,
  };
}

export async function getCalculatorMetrics(windowDays = 30): Promise<CalculatorMetrics> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  let rows: CalcEventRow[] = [];
  try {
    const hl = hlClient();
    const { data, error } = await hl
      .from("estimator_events")
      .select("session_id, contact_id, event_type, payload, utm_source, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: true })
      .limit(50000);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as CalcEventRow[];
  } catch (err) {
    return emptyMetrics(
      windowDays,
      err instanceof Error ? err.message : "HL Supabase query failed",
    );
  }

  // Every funnel number counts UNIQUE SESSIONS, not raw events. A visitor who
  // adds eight windows is one session that configured, not eight conversions.
  const stepSessions: Record<Step, Set<string>> = {
    page_view: new Set(),
    step1_complete: new Set(),
    window_added: new Set(),
    step3_complete: new Set(),
    estimate_completed: new Set(),
    verify_sent: new Set(),
    verify_success: new Set(),
  };

  const contacts = new Set<string>();
  const daily = new Map<string, { views: Set<string>; ctaClicks: number }>();

  // utm_source is recorded on every event, but a session's source is fixed at
  // load, so first value seen wins — later rows can't reassign the session.
  const sessionSource = new Map<string, string>();
  const estimateTotals: number[] = [];

  for (const row of rows) {
    const sid = row.session_id ?? `anon-${row.created_at}`;
    const day = row.created_at.slice(0, 10);
    const evt = row.event_type as Step;

    if (row.contact_id) contacts.add(row.contact_id);
    if (!sessionSource.has(sid)) {
      sessionSource.set(sid, row.utm_source || "(none)");
    }
    if (evt in stepSessions) stepSessions[evt].add(sid);

    if (!daily.has(day)) daily.set(day, { views: new Set(), ctaClicks: 0 });
    const bucket = daily.get(day)!;
    if (evt === "page_view") bucket.views.add(sid);
    if (evt === "verify_sent") bucket.ctaClicks += 1;

    if (evt === "estimate_completed") {
      const raw = row.payload?.estimate_total;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n) && n > 0) estimateTotals.push(n);
    }
  }

  // ---- per-source rollup ----
  const sourceAgg = new Map<
    string,
    { views: Set<string>; step1: Set<string>; estimates: Set<string>; verify: Set<string> }
  >();
  const ensureSource = (s: string) => {
    if (!sourceAgg.has(s)) {
      sourceAgg.set(s, {
        views: new Set(),
        step1: new Set(),
        estimates: new Set(),
        verify: new Set(),
      });
    }
    return sourceAgg.get(s)!;
  };

  for (const [step, sessions] of Object.entries(stepSessions) as [Step, Set<string>][]) {
    for (const sid of sessions) {
      const agg = ensureSource(sessionSource.get(sid) ?? "(none)");
      if (step === "page_view") agg.views.add(sid);
      else if (step === "step1_complete") agg.step1.add(sid);
      else if (step === "estimate_completed") agg.estimates.add(sid);
      else if (step === "verify_success") agg.verify.add(sid);
    }
  }

  const bySource: CalcSourceRow[] = Array.from(sourceAgg.entries())
    .map(([source, a]) => ({
      source,
      views: a.views.size,
      step1: a.step1.size,
      estimates: a.estimates.size,
      verified: a.verify.size,
      completionRate: a.views.size > 0 ? a.estimates.size / a.views.size : 0,
    }))
    .sort((x, y) => y.views - x.views);

  const dailyPoints: CalcDailyPoint[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const bucket = daily.get(d);
    dailyPoints.push({
      day: d,
      views: bucket?.views.size ?? 0,
      ctaClicks: bucket?.ctaClicks ?? 0,
    });
  }

  const pageViews = stepSessions.page_view.size;
  const step1 = stepSessions.step1_complete.size;
  const estimates = stepSessions.estimate_completed.size;

  return {
    windowDays,
    funnel: {
      pageViews,
      step1,
      windowAdded: stepSessions.window_added.size,
      step3: stepSessions.step3_complete.size,
      estimates,
      verifySent: stepSessions.verify_sent.size,
      verified: stepSessions.verify_success.size,
    },
    identifiedContacts: contacts.size,
    avgEstimateTotal:
      estimateTotals.length > 0
        ? estimateTotals.reduce((a, b) => a + b, 0) / estimateTotals.length
        : null,
    completionRate: pageViews > 0 ? estimates / pageViews : 0,
    step1ToEstimate: step1 > 0 ? estimates / step1 : 0,
    bySource,
    daily: dailyPoints,
    error: null,
  };
}
