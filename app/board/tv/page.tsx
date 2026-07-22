import type { Metadata } from "next";
import CapacityBoard from "@/components/capacity-board/CapacityBoard";

/**
 * TV kiosk route — no auth (allow-listed in proxy.ts), reads ONLY the
 * same-origin /api/capacity-board proxy aggregate; nothing else lives here.
 * The component survives unattended: poll failures show the stale state and
 * keep retrying — never a dead white screen requiring a human with a remote.
 *
 * Optional URL params tune the (tomorrow-basis) thresholds without a deploy:
 *   /board/tv?ok=70&crit=50
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
  return (
    <CapacityBoard
      onTrackAt={intParam(params.ok, 70)}
      criticalBelow={intParam(params.crit, 50)}
    />
  );
}
