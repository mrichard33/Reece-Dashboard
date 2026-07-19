import { Loader2 } from "lucide-react";

/**
 * Route-segment loading UI for every dashboard page that doesn't define its own —
 * shows immediately while a page's server components fetch, so navigation never
 * looks stalled.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <span className="inline-flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </span>
    </div>
  );
}
