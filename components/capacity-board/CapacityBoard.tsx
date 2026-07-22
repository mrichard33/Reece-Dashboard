"use client";

/**
 * Appointment Capacity Board — live TV component.
 *
 * Converted 1:1 from the reviewed Claude Design export in
 * ./design-export/export-src.dc.html (1920×1080, navy chrome, conic gauge,
 * day-relative thresholds, stale states), with the mock `base()` data replaced
 * by a 60s poll of the SAME-ORIGIN proxy /api/capacity-board — never the
 * LP-MCP Railway origin directly (CORS, and it would couple the TV to a
 * second host).
 *
 * Additions over the export, per the binding business rules:
 *  - UNRESOLVED renders as its own visible tile whenever any of its counts
 *    are > 0 (rule 2 — it may never be hidden; it takes the legend's cell).
 *  - fill % can legitimately exceed 100 (overbooking is real). The gauge arc
 *    and tile bars cap their RENDER at 100; the printed numbers are never
 *    clamped, and any tile with confirmed > requested shows an OVERBOOKED
 *    indicator (rule 4).
 *  - stale = upstream stale flag OR proxy fetch failure; poll failures freeze
 *    the last good numbers under the stale overlay and keep retrying — the
 *    kiosk never dies to a white screen.
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

const MONO = "'JetBrains Mono',monospace";
const DISPLAY = "Montserrat,sans-serif";

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
   * "fit" (default): scale the 1920×1080 canvas to the real viewport,
   * letterbox-centered, no scrollbars ever. "native": render at 1:1 for
   * TV-side debugging (isolates overscan/zoom problems from our scaling).
   */
  scaleMode?: "fit" | "native";
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

export default function CapacityBoard({ onTrackAt = 70, criticalBelow = 50, scaleMode = "fit" }: CapacityBoardProps) {
  const [offset, setOffset] = useState(1); // default view: tomorrow
  const [data, setData] = useState<CapacityBoardResponse | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // Scale-to-fit: measure the REAL viewport on EVERY change. visualViewport
  // reports the actually-visible area and tracks browser zoom ≠ 100%
  // correctly, where innerWidth/innerHeight can lie; fall back to inner*
  // where it's absent. A ResizeObserver on <html> catches viewport changes
  // that fire no window resize event on TV browsers (overscan mode flips,
  // UI chrome hiding); resize + orientationchange + visualViewport resize
  // cover the rest. No fixed pixel assumptions outside the 1920×1080 frame.
  useEffect(() => {
    const measure = () => {
      const vv = window.visualViewport;
      setViewport({
        w: vv?.width ?? window.innerWidth,
        h: vv?.height ?? window.innerHeight,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      ro?.disconnect();
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
        setFetchFailed(false);
      }
    } catch {
      if (offsetRef.current === off) setFetchFailed(true);
    }
  }, []);

  // Fetch on day change, then poll every 60s. Failures set fetchFailed (→
  // stale overlay) and the interval keeps retrying unattended.
  useEffect(() => {
    load(offset);
    const poll = setInterval(() => load(offsetRef.current), POLL_MS);
    return () => clearInterval(poll);
  }, [offset, load]);

  const maxOffset = data?.forward_days ?? 14;

  // ─── Derive view state (mirrors the export's renderVals) ──────────────────
  const stale = fetchFailed || !data || data.stale;
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
      border: overbooked ? "#9c1015" : pct < thCrit ? "#be123c" : "#1e293b",
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
  const dateRel =
    offset === 0 ? "TODAY — CAPACITY ALREADY SPENT" : offset === 1 ? "TOMORROW" : `IN ${offset} DAYS`;

  const lastSweepMs = data?.last_sweep_at ? new Date(data.last_sweep_at).getTime() : null;
  const ageMin = lastSweepMs ? Math.max(0, Math.round((now - lastSweepMs) / 60_000)) : null;
  const updatedTime = lastSweepMs
    ? new Date(lastSweepMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })
    : "—";
  const updatedAgo = ageMin === null ? "no sweep yet" : `${ageMin} min ago`;
  const freshColor = stale ? "#fb7185" : "#34d399";

  // fit: uniform scale to the measured viewport, remainder letterbox-centered
  // via top-left offsets (transform-origin top-left — percentage-centering
  // plus scale() misplaces the canvas on some TV browsers). native: 1:1.
  const scale =
    scaleMode === "native" || !viewport
      ? 1
      : Math.min(viewport.w / 1920, viewport.h / 1080);
  const offsetLeft = viewport ? Math.max(0, (viewport.w - 1920 * scale) / 2) : 0;
  const offsetTop = viewport ? Math.max(0, (viewport.h - 1080 * scale) / 2) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#020617", overflow: "hidden" }}>
      <style>{`
        html,body{overflow:hidden !important;height:100%;overscroll-behavior:none}
        @keyframes rc-ping{0%{transform:scale(1);opacity:.8}70%,100%{transform:scale(2.4);opacity:0}}
      `}</style>
      <div
        style={{
          position: "absolute",
          left: scaleMode === "native" ? 0 : offsetLeft,
          top: scaleMode === "native" ? 0 : offsetTop,
          width: 1920, height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: "#020617", color: "#f8fafc",
          fontFamily: "Inter,system-ui,sans-serif",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{ height: 104, flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 44px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size kiosk canvas; next/image adds nothing here */}
            <img src="/reece-circle-logo.png" alt="Reece" style={{ width: 56, height: 56 }} />
            <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700, color: "#f8fafc" }}>Appointment capacity</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <button
              onClick={() => setOffset((o) => Math.max(0, o - 1))}
              style={{ width: 52, height: 52, border: "1px solid #1e293b", borderRadius: 6, background: "#0f172a", color: "#94a3b8", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              &#8249;
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 360 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, letterSpacing: ".14em", color: "#94a3b8" }}>{dateRel}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 600, color: "#f8fafc", whiteSpace: "nowrap" }}>{dateMain}</div>
            </div>
            <button
              onClick={() => setOffset((o) => Math.min(maxOffset, o + 1))}
              style={{ width: 52, height: 52, border: "1px solid #1e293b", borderRadius: 6, background: "#0f172a", color: "#94a3b8", fontSize: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              &#8250;
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 300, justifyContent: "flex-end" }}>
            <span style={{ position: "relative", width: 14, height: 14, flex: "none" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor, animation: "rc-ping 1.4s cubic-bezier(0,0,.2,1) infinite" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: 9999, background: freshColor }} />
            </span>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: freshColor, fontVariantNumeric: "tabular-nums" }}>Updated {updatedTime}</div>
              <div style={{ fontSize: 20, color: "#94a3b8" }}>{updatedAgo}</div>
            </div>
          </div>
        </div>

        {/* ── Stale banner ── */}
        {stale && (
          <div style={{ flex: "none", background: "#e11d48", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, height: 64, fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: ".06em" }}>
            DATA STALE<span style={{ fontWeight: 500, fontSize: 20, letterSpacing: 0, opacity: 0.85 }}>These numbers may be wrong. Check the sync.</span>
          </div>
        )}

        {/* ── Main ── */}
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", gap: 26, padding: "30px 44px 38px", opacity: stale ? 0.4 : 1, filter: stale ? "grayscale(.8)" : "none" }}>
            {/* Left column: total gauge + at-risk */}
            <div style={{ width: 480, flex: "none", display: "flex", flexDirection: "column", gap: 26 }}>
              <div style={{ flex: 1, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, display: "flex", flexDirection: "column", padding: "26px 30px", minHeight: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: ".14em", color: "#94a3b8" }}>ALL OFFICES — FILL</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: ".1em", color: totalOverbooked ? "#ed1e24" : totalColor }}>
                    {totalOverbooked ? "OVERBOOKED" : word(totalPct)}
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
                  <div style={{ position: "relative", width: 330, height: 330 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: gaugeBg, WebkitMask: "radial-gradient(closest-side,transparent calc(100% - 28px),#000 calc(100% - 27px))", mask: "radial-gradient(closest-side,transparent calc(100% - 28px),#000 calc(100% - 27px))" }} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 100, fontWeight: 700, lineHeight: 1, color: totalColor }}>
                        {totalPct}
                        <span style={{ fontSize: 46, fontWeight: 600 }}>%</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 18 }}>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 24, color: "#e2e8f0" }}>
                          {totalConf} / {totalReq}
                        </span>
                        <span style={{ fontSize: 20, color: "#94a3b8" }}>confirmed</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "baseline" }}>
                  {totalOverbooked ? (
                    <>
                      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 700, color: "#ed1e24" }}>+{totalConf - totalReq}</span>
                      <span style={{ fontSize: 20, color: "#94a3b8" }}>over requested capacity</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 700, color: "#e2e8f0" }}>{totalReq - totalConf}</span>
                      <span style={{ fontSize: 20, color: "#94a3b8" }}>appointments still to fill</span>
                    </>
                  )}
                </div>
              </div>
              <div style={{ flex: "none", background: "#0f172a", border: "1px solid #9c1015", borderRadius: 8, padding: "26px 30px", display: "flex", alignItems: "center", gap: 28 }}>
                <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 112, fontWeight: 700, lineHeight: 1, color: "#ed1e24" }}>{totalRisk}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: ".12em", color: "#ed1e24" }}>AT RISK — SET, NOT CONFIRMED</div>
                  <div style={{ fontSize: 20, lineHeight: 1.4, color: "#94a3b8", textWrap: "pretty" }}>
                    Customer already said yes. Until confirmed, the rep is not dispatched. Call these first.
                  </div>
                </div>
              </div>
            </div>

            {/* Office tile grid */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gridTemplateRows: "1fr 1fr", gap: 24, minHeight: 0 }}>
              {tiles.map((t) => (
                <div key={t.key} style={{ background: "#0f172a", border: `1px solid ${t.border}`, borderRadius: 8, padding: "24px 28px 22px", display: "flex", flexDirection: "column", minHeight: 0, opacity: t.tileOpacity }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: ".08em", color: "#cbd5e1", whiteSpace: "nowrap" }}>{t.name}</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: ".08em", color: t.overbooked ? "#ed1e24" : t.color, whiteSpace: "nowrap" }}>{t.stateWord}</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 104, fontWeight: 700, lineHeight: 1, color: t.color }}>
                      {t.pct}
                      <span style={{ fontSize: 44, fontWeight: 600 }}>{t.unitTxt}</span>
                    </div>
                  </div>
                  <div style={{ height: 10, borderRadius: 9999, background: "#1e293b", overflow: "hidden", marginBottom: 16 }}>
                    <div style={{ height: "100%", borderRadius: 9999, background: t.color, width: t.barW }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 44 }}>
                    {t.empty ? (
                      <div style={{ fontSize: 22, color: "#64748b" }}>No slots requested today</div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 600, color: "#e2e8f0" }}>
                          {t.conf} / {t.req}
                        </span>
                        <span style={{ fontSize: 20, color: "#94a3b8" }}>confirmed</span>
                        {t.overbooked && (
                          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 700, color: "#ed1e24" }}>
                            +{t.conf - t.req} OVER
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", minHeight: 48 }}>
                      {t.risk > 0 && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 9, padding: "8px 16px", borderRadius: 9999, background: "rgba(148,163,184,.06)", border: "1px solid #334155", whiteSpace: "nowrap" }}>
                          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 28, fontWeight: 700, color: "#ed1e24" }}>{t.risk}</span>
                          <span style={{ fontSize: 20, fontWeight: 600, color: "#94a3b8" }}>at risk</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Legend cell — UNRESOLVED lives in the bottom safety strip now,
                  so the legend always renders. */}
              {(
                <div style={{ border: "1px dashed #334155", borderRadius: 8, padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "center" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: ".14em", color: "#94a3b8" }}>COLOR = STATE</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 9999, background: "#34d399", flex: "none" }} />
                    <span style={{ fontSize: 20, fontWeight: 600, color: "#e2e8f0", width: 140 }}>On track</span>
                    <span style={{ fontFamily: MONO, fontSize: 20, color: "#94a3b8" }}>&#8805; {thOk}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 9999, background: "#fbbf24", flex: "none" }} />
                    <span style={{ fontSize: 20, fontWeight: 600, color: "#e2e8f0", width: 140 }}>Needs work</span>
                    <span style={{ fontFamily: MONO, fontSize: 20, color: "#94a3b8" }}>{thCrit}&#8211;{thOk - 1}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 9999, background: "#fb7185", flex: "none" }} />
                    <span style={{ fontSize: 20, fontWeight: 600, color: "#e2e8f0", width: 140 }}>Critical</span>
                    <span style={{ fontFamily: MONO, fontSize: 20, color: "#94a3b8" }}>&lt; {thCrit}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 9999, background: "#ed1e24", flex: "none" }} />
                    <span style={{ fontSize: 20, fontWeight: 600, color: "#e2e8f0", width: 140 }}>At risk</span>
                    <span style={{ fontSize: 19, color: "#94a3b8" }}>set, not confirmed</span>
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1.45, color: "#64748b", textWrap: "pretty" }}>Thresholds tighten as the date gets closer.</div>
                </div>
              )}
            </div>
          </div>

          {/* ── Stale overlay ── */}
          {stale && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "rgba(2,6,23,.55)" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 96, fontWeight: 700, letterSpacing: ".08em", color: "#fb7185", lineHeight: 1 }}>DATA STALE</div>
              <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 44, fontWeight: 600, color: "#f8fafc" }}>
                Last update {updatedTime} — {updatedAgo}
              </div>
              <div style={{ fontSize: 24, color: "#cbd5e1" }}>
                {data ? "The numbers below are frozen. Trigger a sync." : "No data yet — retrying automatically."}
              </div>
            </div>
          )}
        </div>

        {/* ── UNRESOLVED safety strip — the anti-silent-drop guarantee ── */}
        {unresolvedVisible && (
          <div style={{ flex: "none", height: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(180,83,9,.18)", borderTop: "1px solid #b45309" }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>⚠</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: "#fbbf24", letterSpacing: ".02em" }}>
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
