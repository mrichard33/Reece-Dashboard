import type { Metadata } from "next";
import CapacityBoard from "@/components/capacity-board/CapacityBoard";

/**
 * TV kiosk route — no auth (allow-listed in proxy.ts), reads ONLY the
 * same-origin /api/capacity-board proxy aggregate; nothing else lives here.
 * The component survives unattended: poll failures show the stale state and
 * keep retrying — never a dead white screen requiring a human with a remote.
 *
 * Optional URL params, no deploy needed:
 *   /board/tv?ok=70&crit=50   — tomorrow-basis thresholds
 *   /board/tv?scale=native    — render 1:1 (1920×1080) for TV-side debugging;
 *                               default is scale=fit (letterbox to viewport)
 *   /board/tv?inset=3         — shrink the board 3% on every side; software
 *                               margin for TVs whose hardware overscan crops
 *                               the picture edge (prefer fixing the TV:
 *                               "Just Scan" / "Fit to screen")
 */

export const metadata: Metadata = {
  title: "Appointment Capacity — Reece",
};

function intParam(v: string | string[] | undefined, fallback: number): number {
  const n = parseInt((Array.isArray(v) ? v[0] : v) ?? "", 10);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : fallback;
}

export default async function CapacityTvPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const scaleRaw = Array.isArray(params.scale) ? params.scale[0] : params.scale;
  const insetRaw = parseInt((Array.isArray(params.inset) ? params.inset[0] : params.inset) ?? "", 10);
  return (
    <CapacityBoard
      onTrackAt={intParam(params.ok, 70)}
      criticalBelow={intParam(params.crit, 50)}
      scaleMode={scaleRaw === "native" ? "native" : "fit"}
      safeInsetPct={Number.isFinite(insetRaw) && insetRaw > 0 && insetRaw <= 10 ? insetRaw : 0}
    />
  );
}
