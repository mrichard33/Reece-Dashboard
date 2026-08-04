import { AlertTriangle } from "lucide-react";
import { minutesSince, relTime } from "@/lib/utils";
import { InfoPopover } from "@/components/help/InfoPopover";

export function SyncFreshnessBanner({
  lpLastSync,
  hlLastSync,
}: {
  lpLastSync: Date | string | null;
  hlLastSync: Date | string | null;
}) {
  const lpAge = minutesSince(lpLastSync);
  const hlAge = minutesSince(hlLastSync);
  const worstAge = Math.max(lpAge ?? Infinity, hlAge ?? Infinity);

  if (!Number.isFinite(worstAge) || worstAge < 120) return null;

  const severity = worstAge >= 360 ? "critical" : "warning";
  const tone =
    severity === "critical"
      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";

  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">
          Data may be stale ({severity === "critical" ? "over 6 hours" : "over 2 hours"} since last sync)
        </p>
        <p className="mt-0.5 text-xs">
          LP cache last synced {relTime(lpLastSync)} · HL cache last synced{" "}
          {relTime(hlLastSync)}. Click <strong>Sync now</strong> on this page.
        </p>
      </div>
      <InfoPopover helpKey="shell.staleSync" />
    </div>
  );
}
