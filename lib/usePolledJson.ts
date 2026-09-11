"use client";

import { useEffect, useState } from "react";

/**
 * Poll a JSON endpoint, pausing while the tab is hidden.
 *
 * The shell's badges each hand-rolled this loop, and none of them checked
 * visibility — a dashboard left open in a background tab kept fetching all day.
 * Returns `null` until the first response lands, which every caller already
 * renders as "no count yet".
 *
 * Single-consumer by design. When several components need the SAME endpoint,
 * use a shared module-level store instead (see `components/shell/useAttention.ts`)
 * so they share one timer rather than opening one each.
 *
 * Pass `immediate: false` when the caller already has server-rendered data to
 * show — otherwise mounting fires a fetch for something it was just handed.
 */
export function usePolledJson<T>(
  url: string,
  intervalMs: number,
  { immediate = true }: { immediate?: boolean } = {},
): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let alive = true;
    let inFlight = false;

    async function load() {
      // A slow response must not let the next tick stack a second request.
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as T;
        if (alive) setData(next);
      } catch {
        /* transient */
      } finally {
        inFlight = false;
      }
    }

    // Back from a hidden tab the value is stale by however long the user was
    // away — refetch now rather than waiting out the rest of the interval.
    function onVisibility() {
      if (document.visibilityState === "visible") void load();
    }

    if (immediate) void load();
    const t = setInterval(load, intervalMs);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, intervalMs, immediate]);

  return data;
}
