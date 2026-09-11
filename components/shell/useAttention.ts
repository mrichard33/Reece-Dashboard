"use client";

import { useSyncExternalStore } from "react";
import type { AttentionCounts } from "@/app/api/shell/attention/route";

const POLL_MS = 25_000;

/*
 * One poll, however many consumers.
 *
 * This used to be a plain useEffect+useState hook, which meant every component
 * that called it opened its OWN interval against the same endpoint. Sidebar and
 * AttentionChips both call it and are both mounted on every dashboard page, so
 * the shell was fetching /api/shell/attention twice every 25s, forever, on every
 * page — and each of those is a force-dynamic route that re-runs its queries.
 *
 * The state now lives at module scope behind useSyncExternalStore: the first
 * subscriber starts the timer, the last one to leave stops it, and additional
 * consumers are free. Polling also pauses while the tab is hidden — previously
 * a backgrounded dashboard kept both timers running all day.
 */

let counts: AttentionCounts | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function load() {
  // Overlapping fetches would be pointless work — a slow response must not let
  // the next tick stack a second request on top of it.
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/shell/attention", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as AttentionCounts;
    // Identical payloads are the common case; re-rendering every consumer for
    // an unchanged object is churn the shell can skip.
    if (JSON.stringify(data) !== JSON.stringify(counts)) {
      counts = data;
      emit();
    }
  } catch {
    /* transient */
  } finally {
    inFlight = false;
  }
}

function visible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function start() {
  if (timer) return;
  timer = setInterval(() => {
    if (visible()) void load();
  }, POLL_MS);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

function onVisibility() {
  // Coming back to a tab that has been hidden: the counts are stale by however
  // long the user was away, so refetch immediately rather than waiting a tick.
  if (visible() && listeners.size > 0) void load();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    void load();
    start();
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

const getSnapshot = () => counts;
// Server render has no counts yet; the chips and badges already handle null.
const getServerSnapshot = () => null;

/**
 * The shell's attention counts (open/urgent issues, approvals waiting, services
 * watching) — the single source of truth behind the top-bar chips and the
 * sidebar nav badges. Returns `null` until the first response lands.
 */
export function useAttention(): AttentionCounts | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
