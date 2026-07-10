"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Error boundary for the Scorecard route. The data layer is resilient (every fetch
 * is wrapped and falls back to null / the empty state), so this is the final safety
 * net for an unexpected render error — it degrades to a friendly card instead of a
 * raw 500 and surfaces the message + digest so the failure can be diagnosed from a
 * screenshot. The digest also ties back to the matching server-log entry.
 */
export default function ScorecardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Emits to the browser console with the digest for cross-referencing server logs.
    console.error("[scorecard] render error:", error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
        <h2 className="font-display text-base font-semibold text-amber-900 dark:text-amber-200">
          The scorecard couldn&apos;t render
        </h2>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          The underlying data loaded, but something went wrong building the view. Try
          again — if it keeps happening, the details below identify the cause.
        </p>
        {error?.message && (
          <p className="mt-2 break-words font-mono text-xs text-amber-700 dark:text-amber-400">
            {error.message}
          </p>
        )}
        {error?.digest && (
          <p className="mt-1 font-mono text-[11px] text-amber-600 dark:text-amber-500">
            digest: {error.digest}
          </p>
        )}
        <Button className="mt-4" size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
