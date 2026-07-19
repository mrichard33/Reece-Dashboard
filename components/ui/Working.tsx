"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Inline in-flight indicator: animated spinner + label + a live elapsed-seconds
 * counter, so long-running background work (draft generation, the Strategist,
 * image regeneration) visibly makes progress instead of sitting on static text.
 */
export function Working({ label }: { label: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-sky-700 dark:text-sky-300">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      <span>{label}</span>
      <span className="tabular-nums text-slate-400">{secs}s</span>
    </span>
  );
}
