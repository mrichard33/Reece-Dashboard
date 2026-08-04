"use client";

/**
 * Appointment Capacity Board — live TV component.
 *
 * Converted 1:1 from the reviewed Claude Design export v2 in
 * ./design-export-2/Capacity Board.dc.html (1920×1080 reference frame, navy
 * chrome, conic gauge, confirmed-count hero tiles, "in the hopper" language,
 * day-relative thresholds, stale states), with the mock `base()` data replaced
 * by a 60s poll of the SAME-ORIGIN proxy /api/capacity-board — never the
 * LP-MCP Railway origin directly (CORS, and it would couple the TV to a
 * second host).
 *
 * Scaling: the design's 1920×1080 px values are authored here through u(),
 * which emits `min(Xvw, Yvh)` so every dimension is a pure-CSS fraction of
 * the real viewport. The board mathematically cannot exceed 100vw/100vh —
 * no JS viewport measurement, no resize events, nothing to go stale. This
 * replaces the measured transform:scale() canvas that kept clipping the
 * right edge on the wall TV whenever a resize signal was missed. If a TV
 * still crops edges after this, that is hardware overscan — set the TV to
 * "Just Scan"/"Fit to screen", or pass ?inset=N to shrink the board N% on
 * every side as a software margin.
 *
 * Additions over the export, per the binding business rules:
 *  - UNRESOLVED renders as a full-width bottom safety strip whenever any of
 *    its counts are > 0 (rule 2 — it may never be hidden).
 *  - fill % can legitimately exceed 100 (overbooking is real). The gauge arc
 *    and tile bars cap their RENDER at 100; the printed numbers are never
 *    clamped, and any tile with confirmed > requested shows an OVERBOOKED
 *    indicator (rule 4).
 *  - "TODAY" plain, not the export's "TODAY — CAPACITY ALREADY SPENT"
 *    (removed at Mark's request, 2026-07-22).
 *  - stale = upstream stale flag OR 3 CONSECUTIVE proxy fetch failures
 *    (~3 min at POLL_MS). A single dropped poll used to black out the whole
 *    board; the streak tolerance keeps the last good numbers on screen through
 *    a blip and still surfaces a genuinely dead feed. Either way the poll keeps
 *    retrying — the kiosk never dies to a white screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Proxy response shape (verbatim from LP-MCP /board/capacity) ─────────────

type BoardBucket = {
  requested: number;
  booked: number;
  confirmed: number;
  set_pending: number;
};

type BoardOffice = BoardBucket & {
  market: string;
  office_label: string;
  fill_pct: number | null;
};

export type CapacityBoardResponse = {
  date: string;
  generated_at: string;
  last_sweep_at: string | null;
  sweep_interval_ms: number;
  forward_days: number;
  stale: boolean;
  stale_after_ms?: number;
  offices: BoardOffice[];
  unresolved: BoardBucket;
  totals: BoardBucket & { fill_pct: number | null };
};

// ─── Constants ───────────────────────────────────────────────────────────────

const ET = "America/New_York";
const POLL_MS = 60_000;

// Display order from the reviewed design; unknown markets append alphabetically.
const MARKET_ORDER = [
  "FTLAU_MKT",
  "JAX_MKT",
  "ORL_MKT",
  "STPET_MKT",
  "FTMYR_MKT",
  "SAR_MKT",
  "LAKE_MKT",
];

// next/font registers each face under a HASHED family name exposed only via
// the CSS variables set on <html> in app/layout.tsx — the literal families
// ("Montserrat", "JetBrains Mono") are never declared. Referencing the
// literals meant the board silently rendered in wider fallback fonts, whose
// nowrap rows blew the tile grid past the canvas and clipped the rightmost
// box on the TV. Always go through the variables.
const BODY = "var(--font-inter), Inter, system-ui, sans-serif";
const MONO = "var(--font-jetbrains-mono), 'JetBrains Mono', ui-monospace, monospace";
const DISPLAY = "var(--font-montserrat), Montserrat, sans-serif";
// Hopper (set, not confirmed) accent — pale cream, per design v3. Distinct
// from the amber NEEDS WORK and pink CRITICAL states (Mark: not red).
const HOPPER = "#FAF0C9";
// Overbooked = more confirmed than requested. Green text + green outline
// (Mark, 2026-07-22) — it reads as a win, not an alarm.
const OVERBOOK = "#34d399";

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  return {
    y: Number(dateStr.slice(0, 4)),
    m: Number(dateStr.slice(5, 7)),
    d: Number(dateStr.slice(8, 10)),
  };
}

/** Pure calendar arithmetic on YYYY-MM-DD (UTC math — no tz drift). */
function addDays(dateStr: string, n: number): string {
  const { y, m, d } = parseYmd(dateStr);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function longDate(dateStr: string): string {
  const { y, m, d } = parseYmd(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export type CapacityBoardProps = {
  /** Fill % at/above which a tile is ON TRACK for tomorrow (relaxes 8/day further out). */
  onTrackAt?: number;
  /** Fill % below which a tile is CRITICAL for tomorrow (relaxes 8/day further out). */
  criticalBelow?: number;
  /**
   * "fit" (default): pure-CSS proportional scale to the viewport, letterbox-
   * centered, no scrollbars ever. "native": render at 1:1 (1920×1080) for
   * TV-side debugging (isolates overscan/zoom problems from our scaling).
   */
  scaleMode?: "fit" | "native";
  /**
   * Shrink the board this % on every side (0–10). Software margin for TVs
   * whose hardware overscan crops the picture edge — the browser cannot see
   * that cropping, so no layout math can avoid it without a margin.
   */
  safeInsetPct?: number;
};

type TileVM = {
  key: string;
  name: string;
  req: number;
  conf: number;
  risk: number;
  overbooked: boolean;
  unresolved: boolean;
  pct: string;
  unitTxt: string;
  color: string;
  stateWord: string;
  barW: string;
  border: string;
  tileOpacity: number;
  empty: boolean;
};

export default function CapacityBoard({
  onTrackAt = 70,
  criticalBelow = 50,
  scaleMode = "fit",
  safeInsetPct = 0,
}: CapacityBoardProps) {
  const [offset, setOffset] = useState(1); // default view: tomorrow
  const [data, setData] = useState<CapacityBoardResponse | null>(null);
  const [failStreak, setFailStreak] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const offsetRef = useRef(offset);
  // eslint-disable-next-line react-hooks/refs -- latest-value mirror read only inside the poll interval, never during render
  offsetRef.current = offset;

  // Viewport measurement is ONLY used to pick mobile vs TV layout (<900px
  // wide). TV-layout sizing itself is pure CSS (see u() below) and does not
  // depend on this. visualViewport tracks browser zoom correctly where
  // innerWidth can lie; the listeners + 2s backstop make the mobile/TV
  // switch converge even on browsers that drop resize events.
  useEffect(() => {
    const measure = () => {
      const vv = window.visualViewport;
      const w = vv?.width ?? window.innerWidth;
      const h = vv?.height ?? window.innerHeight;
      // Referential no-op when unchanged so the 2s backstop doesn't re-render.
      setViewport((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const backstop = setInterval(measure, 2_000);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      clearInterval(backstop);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const load = useCallback(async (off: number) => {
    const date = addDays(todayET(), off);
    try {
      const res = await fetch(`/api/capacity-board?date=${date}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const body = (await res.json()) as CapacityBoardResponse;
      // A slow response for a date the viewer already navigated away from
      // must not clobber the active view.
      if (offsetRef.current === off) {
        setData(body);
        setFailStreak(0);
      }
    } catch {
      if (offsetRef.current === off) setFailStreak((n) => n + 1);
    }
  }, []);

  // Fetch on day change, then poll every 60s. Failures increment failStreak
  // (→ stale overlay only once POLL_FAIL_TOLERANCE consecutive polls miss) and
  // the interval keeps retrying unattended.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() is the kiosk's data fetch; the immediate call seeds the first paint, the interval keeps it fresh
    load(offset);
    const poll = setInterval(() => load(offsetRef.current), POLL_MS);
    return () => clearInterval(poll);
  }, [offset, load]);

  // Kiosk self-heal (Mark, 2026-07-22 — "make sure the screen refreshes on
  // its own"): the 60s data poll keeps numbers live, an immediate refetch
  // fires whenever the tab becomes visible again, and a full page reload
  // every 60 minutes recovers from anything that could wedge a long-running
  // unattended browser (leaked memory, frozen JS, stale bundle after a
  // deploy).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load(offsetRef.current);
    };
    document.addEventListener("visibilitychange", onVisible);
    const hardReload = setTimeout(() => window.location.reload(), 60 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(hardReload);
    };
  }, [load]);

  const maxOffset = data?.forward_days ?? 14;

  // ─── Derive view state (mirrors the export's renderVals) ──────────────────
  // Tolerate transient poll failures: one dropped fetch is not stale data.
  // 3 consecutive misses ≈ 3 min at POLL_MS, still well inside the server's
  // own freshness window.
  const POLL_FAIL_TOLERANCE = 3;
  const stale = failStreak >= POLL_FAIL_TOLERANCE || !data || data.stale;
  const relax = Math.max(0, offset - 1) * 8;
  const thOk = Math.max(45, onTrackAt - relax);
  const thCrit = Math.max(25, criticalBelow - relax);
  const col = (p: number) => (p >= thOk ? "#34d399" : p >= thCrit ? "#fbbf24" : "#fb7185");
  const word = (p: number) => (p >= thOk ? "ON TRACK" : p >= thCrit ? "NEEDS WORK" : "CRITICAL");

  const orderedOffices = [...(data?.offices ?? [])].sort((a, b) => {
    const ia = MARKET_ORDER.indexOf(a.market);
    const ib = MARKET_ORDER.indexOf(b.market);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.market.localeCompare(b.market);
  });

  const tileFor = (name: string, b: BoardBucket): TileVM => {
    if (b.requested === 0) {
      return {
        key: name, name, req: 0, conf: 0, risk: 0, overbooked: false, unresolved: false,
        pct: "—", unitTxt: "", color: "#64748b", stateWord: "NO SLOTS", barW: "0%",
        border: "#1e293b", tileOpacity: 0.4, empty: true,
      };
    }
    const pct = Math.round((100 * b.confirmed) / b.requested);
    const overbooked = b.confirmed > b.requested;
    return {
      key: name, name, req: b.requested, conf: b.confirmed, risk: b.set_pending,
      overbooked, unresolved: false,
      pct: String(pct), unitTxt: "%", color: col(pct), stateWord: overbooked ? "OVERBOOKED" : word(pct),
      barW: Math.min(100, pct) + "%", // bar render caps at 100 — the number never does
      // 100%+ = green outline (Mark, 2026-07-22) — full counts as done, not
      // just overbooked.
      border: pct >= 100 ? OVERBOOK : pct < thCrit ? "#be123c" : "#1e293b",
      tileOpacity: 1, empty: false,
    };
  };

  const tiles: TileVM[] = orderedOffices.map((o) =>
    tileFor(o.office_label.toUpperCase(), o),
  );

  // UNRESOLVED safety strip (fix-pass 2): no longer a grid tile — it has no
  // slot capacity, so a tile rendered a nonsense "7 / 0 confirmed". Instead:
  // all-zero → nothing renders (the normal state); any count > 0 → a slim
  // full-width warning strip that CANNOT be configured away. An empty bucket
  // is invisible; a non-empty one is impossible to miss.
  const unresolvedAppts = data ? data.unresolved.confirmed + data.unresolved.set_pending : 0;
  const unresolvedSlots = data?.unresolved.requested ?? 0;
  const unresolvedVisible = unresolvedAppts > 0 || unresolvedSlots > 0;

  const totalReq = data?.totals.requested ?? 0;
  const totalConf = data?.totals.confirmed ?? 0;
  const totalRisk = data?.totals.set_pending ?? 0;
  const totalPct = totalReq ? Math.round((100 * totalConf) / totalReq) : 0;
  const totalOverbooked = totalConf > totalReq;
  const totalColor = col(totalPct);
  const deg = (270 * Math.min(100, totalPct)) / 100; // arc render caps at 100
  const gaugeBg = `conic-gradient(from 225deg, ${totalColor} 0deg ${deg}deg, #1e293b ${deg}deg 270deg, transparent 270deg 360deg)`;

  const viewDate = addDays(todayET(), offset);
  const dateMain = longDate(viewDate);
  const dateRel = offset === 0 ? "TODAY" : offset === 1 ? "TOMORROW" : `IN ${offset} DAYS`;

  const lastSweepMs = data?.last_sweep_at ? new Date(data.last_sweep_at).getTime() : null;
  const ageMin = lastSweepMs ? Math.max(0, Math.round((now - lastSweepMs) / 60_000)) : null;
  const updatedTime = lastSweepMs
    ? new Date(lastSweepMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })
    : "—";
  const updatedAgo = ageMin === null ? "no sweep yet" : `${ageMin} min ago`;
  const freshColor = stale ? "#fb7185" : "#34d399";

  // Small screens get a native responsive layout instead of a shrunken
  // 1920×1080 canvas (unreadable on a phone). ?scale=native still forces the
  // TV canvas for debugging.
  const isMobile = scaleMode !== "native" && !!viewport && viewport.w < 900;

  if (isMobile) {
    const freshDot = (
      <span style={{ position: "relative", width: 10, height: 10, flex: "none" }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor, animation: "rc-ping 1.4s cubic-bezier(0,0,.2,1) infinite" }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor }} />
      </span>
    );
    return (
      <div style={{ minHeight: "100dvh", background: "#020617", color: "#f8fafc", fontFamily: BODY, display: "flex", flexDirection: "column" }}>
        <style>{`@keyframes rc-ping{0%{transform:scale(1);opacity:.8}70%,100%{transform:scale(2.4);opacity:0}}`}</style>

        {/* Sticky header: title + freshness, date nav */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#020617", borderBottom: "1px solid #1e293b", padding: "10px 14px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
              <img src="/reece-circle-logo.png" alt="Reece" style={{ width: 26, height: 26 }} />
              <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700 }}>Appointment Capacity</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {freshDot}
              <span style={{ fontFamily: MONO, fontSize: 12, color: freshColor, fontVariantNumeric: "tabular-nums" }}>{updatedTime}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <button onClick={() => setOffset((o) => Math.max(0, o - 1))} style={{ width: 40, height: 40, border: "1px solid #1e293b", borderRadius: 6, background: "#0f172a", color: "#94a3b8", fontSize: 18 }}>&#8249;</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 600, letterSpacing: ".14em", color: "#94a3b8" }}>{dateRel}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, whiteSpace: "nowrap" }}>{dateMain}</div>
            </div>
            <button onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))} style={{ width: 40, height: 40, border: "1px solid #1e293b", borderRadius: 6, background: "#0f172a", color: "#94a3b8", fontSize: 18 }}>&#8250;</button>
          </div>
        </div>

        {stale && (
          <div style={{ background: "#e11d48", color: "#fff", padding: "8px 14px", fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: ".05em", textAlign: "center" }}>
            DATA STALE — last update {updatedTime} ({updatedAgo})
          </div>
        )}

        <div style={{ flex: 1, padding: 14, display: "flex", flexDirection: "column", gap: 12, opacity: stale ? 0.5 : 1, filter: stale ? "grayscale(.7)" : "none" }}>
          {/* Hero: gauge + hopper */}
          <div style={{ background: "#0f172a", border: `1px solid ${totalPct >= 100 ? OVERBOOK : "#1e293b"}`, borderRadius: 8, padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 132, height: 132, flex: "none" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: gaugeBg, WebkitMask: "radial-gradient(closest-side,transparent calc(100% - 13px),#000 calc(100% - 12px))", mask: "radial-gradient(closest-side,transparent calc(100% - 13px),#000 calc(100% - 12px))" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 34, fontWeight: 700, lineHeight: 1, color: totalColor }}>
                  {totalConf}
                </div>
                <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: totalColor, marginTop: 2 }}>{totalPct}%</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: totalColor }}>
                {totalOverbooked ? "OVERBOOKED" : word(totalPct)}
              </div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, color: "#e2e8f0" }}>{totalOverbooked ? `+${totalConf - totalReq}` : totalReq - totalConf}</span>{" "}
                {totalOverbooked ? "overbooked" : "still to fill"} · <span style={{ fontFamily: MONO, fontWeight: 700, color: "#e2e8f0" }}>{totalReq}</span> requested
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 24, fontWeight: 700, color: HOPPER }}>{totalRisk}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>in the hopper — set, not confirmed</span>
              </div>
            </div>
          </div>

          {/* Office cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {tiles.map((t) => (
              <div key={t.key} style={{ background: "#0f172a", border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px", opacity: t.tileOpacity, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: t.color, whiteSpace: "nowrap" }}>{t.stateWord}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 34, fontWeight: 700, lineHeight: 1, color: t.color }}>
                    {t.empty ? "—" : t.conf}
                  </span>
                  {!t.empty && <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 17, fontWeight: 600, color: "#94a3b8" }}>/ {t.req}</span>}
                  {!t.empty && <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700, color: t.color, marginLeft: "auto" }}>{t.pct}{t.unitTxt}</span>}
                </div>
                <div style={{ height: 6, borderRadius: 9999, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 9999, background: t.color, width: t.barW }} />
                </div>
                {t.empty ? (
                  <div style={{ fontSize: 12, color: "#64748b" }}>No slots requested</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                    {t.overbooked && <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: OVERBOOK }}>+{t.conf - t.req} OVER</span>}
                    {t.risk > 0 && <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: HOPPER }}>{t.risk} in hopper</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* UNRESOLVED safety strip — same guarantee, sticky on mobile */}
        {unresolvedVisible && (
          <div style={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", background: "rgba(180,83,9,.95)", color: "#fff", fontFamily: DISPLAY, fontSize: 13, fontWeight: 700 }}>
            <span>⚠</span>
            <span>
              {unresolvedAppts > 0
                ? `${unresolvedAppts} appointment${unresolvedAppts === 1 ? "" : "s"} unassigned — check mapping`
                : `${unresolvedSlots} slot${unresolvedSlots === 1 ? "" : "s"} unmapped — check mapping`}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Never paint the TV canvas before the first viewport measurement lands —
  // a phone would flash the TV layout for a frame before the mobile branch
  // takes over. Render a plain black frame instead.
  if (scaleMode !== "native" && !viewport) {
    return <div style={{ position: "fixed", inset: 0, background: "#020617" }} />;
  }

  // ─── Pure-CSS proportional units ──────────────────────────────────────────
  // u(n) maps a design px (1920×1080 reference) to min(vw, vh) fractions of
  // the real viewport: n/19.2 vw is the size when width binds, n/10.8 vh when
  // height binds; min() picks whichever fits, so the whole board scales
  // uniformly and can never exceed the screen in either axis. The outer flex
  // container centers the letterbox remainder. safeInsetPct shrinks the board
  // for TVs with hardware overscan.
  const inset = Math.min(10, Math.max(0, safeInsetPct));
  const k = (100 - 2 * inset) / 100;
  const u = (n: number): string =>
    scaleMode === "native"
      ? `${n}px`
      : `min(${+(n * k / 19.2).toFixed(4)}vw, ${+(n * k / 10.8).toFixed(4)}vh)`;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#020617", overflow: "hidden",
        display: "flex",
        alignItems: scaleMode === "native" ? "flex-start" : "center",
        justifyContent: scaleMode === "native" ? "flex-start" : "center",
      }}
    >
      <style>{`
        html,body{overflow:hidden !important;height:100%;overscroll-behavior:none}
        @keyframes rc-ping{0%{transform:scale(1);opacity:.8}70%,100%{transform:scale(2.4);opacity:0}}
      `}</style>
      <div
        style={{
          width: u(1920), height: u(1080),
          background: "#020617", color: "#f8fafc",
          fontFamily: BODY,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{ height: u(104), flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${u(44)}`, borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(18) }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-ratio kiosk canvas; next/image adds nothing here */}
            <img src="/reece-circle-logo.png" alt="Reece" style={{ width: u(56), height: u(56) }} />
            <div style={{ fontFamily: DISPLAY, fontSize: u(28), fontWeight: 700, color: "#f8fafc" }}>Appointment Capacity</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: u(22) }}>
            <button
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              style={{ width: u(52), height: u(52), border: "1px solid #1e293b", borderRadius: u(6), background: "#0f172a", color: "#94a3b8", fontSize: u(24), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              &#8249;
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: u(3), minWidth: u(360) }}>
              <div style={{ fontFamily: DISPLAY, fontSize: u(20), fontWeight: 600, letterSpacing: ".14em", color: "#94a3b8" }}>{dateRel}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: u(32), fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap" }}>{dateMain}</div>
            </div>
            <button
              onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
              style={{ width: u(52), height: u(52), border: "1px solid #1e293b", borderRadius: u(6), background: "#0f172a", color: "#94a3b8", fontSize: u(24), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              &#8250;
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: u(14), minWidth: u(300), justifyContent: "flex-end" }}>
            <span style={{ position: "relative", width: u(14), height: u(14), flex: "none" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor, animation: "rc-ping 1.4s cubic-bezier(0,0,.2,1) infinite" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor }} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: u(1) }}>
              <div style={{ fontFamily: MONO, fontSize: u(22), fontWeight: 600, color: freshColor, fontVariantNumeric: "tabular-nums" }}>Updated {updatedTime}</div>
              <div style={{ fontSize: u(20), color: "#94a3b8" }}>{updatedAgo}</div>
            </div>
          </div>
        </div>

        {/* ── Stale banner ── */}
        {stale && (
          <div style={{ flex: "none", background: "#e11d48", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", gap: u(16), height: u(64), fontFamily: DISPLAY, fontSize: u(24), fontWeight: 700, letterSpacing: ".06em" }}>
            DATA STALE<span style={{ fontWeight: 500, fontSize: u(20), letterSpacing: 0, opacity: 0.85 }}>These numbers may be wrong. Check the sync.</span>
          </div>
        )}

        {/* ── Main ── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", gap: u(26), padding: `${u(30)} ${u(44)} ${u(38)}`, opacity: stale ? 0.4 : 1, filter: stale ? "grayscale(.8)" : "none" }}>
            {/* Left column: total gauge + hopper */}
            <div style={{ width: u(480), flex: "none", display: "flex", flexDirection: "column", gap: u(26) }}>
              <div style={{ flex: 1, background: "#0f172a", border: `1px solid ${totalPct >= 100 ? OVERBOOK : "#1e293b"}`, borderRadius: u(8), display: "flex", flexDirection: "column", padding: `${u(26)} ${u(30)}`, minHeight: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: u(16), fontWeight: 600, letterSpacing: ".14em", color: "#94a3b8" }}>ALL OFFICES — FILL</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: u(15), fontWeight: 700, letterSpacing: ".1em", color: totalColor }}>
                    {totalOverbooked ? "OVERBOOKED" : word(totalPct)}
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                  <div style={{ position: "relative", width: u(330), height: u(330) }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: gaugeBg, WebkitMask: `radial-gradient(closest-side,transparent calc(100% - ${u(28)}),#000 calc(100% - ${u(27)}))`, mask: `radial-gradient(closest-side,transparent calc(100% - ${u(28)}),#000 calc(100% - ${u(27)}))` }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      {/* Design v3: confirmed COUNT is the gauge hero, fill %
                          below it, then the 'confirmed' label. */}
                      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(100), fontWeight: 700, lineHeight: 1, color: totalColor }}>
                        {totalConf}
                      </div>
                      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(40), fontWeight: 600, color: totalColor, marginTop: u(10) }}>
                        {totalPct}%
                      </div>
                      <div style={{ fontSize: u(22), color: "#94a3b8", marginTop: u(6) }}>confirmed</div>
                    </div>
                  </div>
                </div>
                {/* Footer: two stats — 'still to fill | requested' (design v3).
                    When overbooked, the left stat shows the overbook in green. */}
                <div style={{ display: "flex", justifyContent: "center", gap: u(24), alignItems: "baseline" }}>
                  <div style={{ display: "flex", gap: u(9), alignItems: "baseline" }}>
                    {totalOverbooked ? (
                      <>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(28), fontWeight: 700, color: OVERBOOK }}>+{totalConf - totalReq}</span>
                        <span style={{ fontSize: u(20), color: "#94a3b8" }}>overbooked</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(28), fontWeight: 700, color: "#e2e8f0" }}>{totalReq - totalConf}</span>
                        <span style={{ fontSize: u(20), color: "#94a3b8" }}>still to fill</span>
                      </>
                    )}
                  </div>
                  <span style={{ color: "#334155" }}>|</span>
                  <div style={{ display: "flex", gap: u(9), alignItems: "baseline" }}>
                    <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(28), fontWeight: 700, color: "#e2e8f0" }}>{totalReq}</span>
                    <span style={{ fontSize: u(20), color: "#94a3b8" }}>requested</span>
                  </div>
                </div>
              </div>
              <div style={{ flex: "none", background: "#0f172a", border: "1px solid #334155", borderRadius: u(8), padding: `${u(26)} ${u(30)}`, display: "flex", alignItems: "center", gap: u(28) }}>
                <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(112), fontWeight: 700, lineHeight: 1, color: HOPPER }}>{totalRisk}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: u(8) }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: u(16), fontWeight: 700, letterSpacing: ".12em", color: HOPPER }}>IN THE HOPPER — SET, NOT CONFIRMED</div>
                  <div style={{ fontSize: u(20), lineHeight: 1.4, color: "#94a3b8", textWrap: "pretty" }}>
                    Customer already said yes. Until confirmed, the rep is not dispatched. Call these first.
                  </div>
                </div>
              </div>
            </div>

            {/* Office tile grid */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: u(24), minHeight: 0, minWidth: 0 }}>
              {tiles.map((t) => (
                <div key={t.key} style={{ background: "#0f172a", border: `1px solid ${t.border}`, borderRadius: u(8), padding: `${u(24)} ${u(28)} ${u(22)}`, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, overflow: "hidden", opacity: t.tileOpacity }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: u(8) }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: u(18), fontWeight: 700, letterSpacing: ".08em", color: "#cbd5e1", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: u(14), fontWeight: 700, letterSpacing: ".08em", color: t.color, whiteSpace: "nowrap" }}>{t.stateWord}</div>
                  </div>
                  {/* Confirmed is the hero number (design v2 + Mark, 2026-07-22);
                      requested rides beside it smaller; the fill % sits below. */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {t.empty ? (
                      <div style={{ fontSize: u(22), color: "#64748b" }}>No slots requested today</div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-end", gap: u(10) }}>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(112), fontWeight: 700, lineHeight: 0.85, color: t.color }}>
                          {t.conf}
                        </span>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(34), fontWeight: 600, color: "#64748b", whiteSpace: "nowrap", lineHeight: 1 }}>
                          /&#8202;{t.req}
                        </span>
                        {t.overbooked && (
                          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(22), fontWeight: 700, color: OVERBOOK, whiteSpace: "nowrap", lineHeight: 1 }}>
                            +{t.conf - t.req} OVER
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: u(8), marginBottom: u(10), minHeight: u(30) }}>
                    {!t.empty && (
                      <>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(26), fontWeight: 700, color: t.color }}>
                          {t.pct}{t.unitTxt}
                        </span>
                        <span style={{ fontSize: u(20), color: "#94a3b8" }}>filled</span>
                      </>
                    )}
                  </div>
                  <div style={{ height: u(10), borderRadius: 9999, background: "#1e293b", overflow: "hidden", marginBottom: u(16) }}>
                    <div style={{ height: "100%", borderRadius: 9999, background: t.color, width: t.barW }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", minHeight: u(48) }}>
                    {t.risk > 0 && (
                      <div style={{ display: "flex", alignItems: "baseline", gap: u(9), padding: `${u(8)} ${u(16)}`, borderRadius: 9999, background: "rgba(148,163,184,.06)", border: "1px solid #334155", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(28), fontWeight: 700, color: HOPPER }}>{t.risk}</span>
                        <span style={{ fontSize: u(20), fontWeight: 600, color: "#94a3b8" }}>in hopper</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Legend cell — UNRESOLVED lives in the bottom safety strip, so
                  the legend always renders. */}
              <div style={{ border: "1px dashed #334155", borderRadius: u(8), padding: `${u(24)} ${u(28)}`, display: "flex", flexDirection: "column", gap: u(14), justifyContent: "center" }}>
                <div style={{ fontFamily: DISPLAY, fontSize: u(15), fontWeight: 700, letterSpacing: ".14em", color: "#94a3b8" }}>COLOR = STATE</div>
                <div style={{ display: "flex", alignItems: "center", gap: u(12) }}>
                  <span style={{ width: u(16), height: u(16), borderRadius: 9999, background: "#34d399", flex: "none" }} />
                  <span style={{ fontSize: u(20), fontWeight: 600, color: "#e2e8f0", width: u(140) }}>On track</span>
                  <span style={{ fontFamily: MONO, fontSize: u(20), color: "#94a3b8" }}>&#8805; {thOk}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: u(12) }}>
                  <span style={{ width: u(16), height: u(16), borderRadius: 9999, background: "#fbbf24", flex: "none" }} />
                  <span style={{ fontSize: u(20), fontWeight: 600, color: "#e2e8f0", width: u(140) }}>Needs work</span>
                  <span style={{ fontFamily: MONO, fontSize: u(20), color: "#94a3b8" }}>{thCrit}&#8211;{thOk - 1}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: u(12) }}>
                  <span style={{ width: u(16), height: u(16), borderRadius: 9999, background: "#fb7185", flex: "none" }} />
                  <span style={{ fontSize: u(20), fontWeight: 600, color: "#e2e8f0", width: u(140) }}>Critical</span>
                  <span style={{ fontFamily: MONO, fontSize: u(20), color: "#94a3b8" }}>&lt; {thCrit}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: u(12) }}>
                  <span style={{ width: u(16), height: u(16), borderRadius: 9999, background: HOPPER, flex: "none" }} />
                  <span style={{ fontSize: u(20), fontWeight: 600, color: "#e2e8f0", width: u(140) }}>In hopper</span>
                  <span style={{ fontSize: u(19), color: "#94a3b8" }}>set, not confirmed</span>
                </div>
                <div style={{ fontSize: u(17), lineHeight: 1.45, color: "#64748b", textWrap: "pretty" }}>Thresholds tighten as the date gets closer.</div>
              </div>
            </div>
          </div>

          {/* ── Stale overlay ── */}
          {stale && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: u(18), background: "rgba(2,6,23,.55)" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: u(96), fontWeight: 700, letterSpacing: ".08em", color: "#fb7185", lineHeight: 1 }}>DATA STALE</div>
              <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: u(44), fontWeight: 600, color: "#f8fafc" }}>
                Last update {updatedTime} — {updatedAgo}
              </div>
              <div style={{ fontSize: u(24), color: "#cbd5e1" }}>
                {data ? "The numbers below are frozen. Trigger a sync." : "No data yet — retrying automatically."}
              </div>
            </div>
          )}
        </div>

        {/* ── UNRESOLVED safety strip — the anti-silent-drop guarantee ── */}
        {unresolvedVisible && (
          <div style={{ flex: "none", height: u(56), display: "flex", alignItems: "center", justifyContent: "center", gap: u(14), background: "rgba(180,83,9,.18)", borderTop: "1px solid #b45309" }}>
            <span style={{ fontSize: u(26), lineHeight: 1 }}>⚠</span>
            <span style={{ fontFamily: DISPLAY, fontSize: u(22), fontWeight: 700, color: "#fbbf24", letterSpacing: ".02em" }}>
              {unresolvedAppts > 0
                ? `${unresolvedAppts} appointment${unresolvedAppts === 1 ? "" : "s"} unassigned to an office — check mapping`
                : `${unresolvedSlots} capacity slot${unresolvedSlots === 1 ? "" : "s"} unmapped to an office — check mapping`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
