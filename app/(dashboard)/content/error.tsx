"use client";

import { Button } from "@/components/ui/Button";

/**
 * Error boundary for the Content area. Catches any unexpected server/render error
 * (e.g. a transient DB failure) and shows a friendly message instead of a raw 500.
 * The common "tables not set up" case is handled gracefully upstream by the
 * resilient queries + the setup banner, but this is the final safety net.
 */
export default function ContentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
        <h2 className="font-display text-base font-semibold text-amber-900 dark:text-amber-200">
          The content engine couldn&apos;t load
        </h2>
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          If this is a fresh deploy, the database migrations may not be applied yet — run{" "}
          <code className="font-mono">db/migrations/0003_fb_content_engine.sql</code> and{" "}
          <code className="font-mono">0004_fb_seed.sql</code> in Supabase, then retry.
        </p>
        {error?.message && (
          <p className="mt-2 font-mono text-xs text-amber-700 dark:text-amber-400">
            {error.message}
          </p>
        )}
        <Button className="mt-4" size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
