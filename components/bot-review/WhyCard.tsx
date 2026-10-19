"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupIssues, WHY_CARD_MAX_LINES, type Issue } from "@/lib/botReview/conversation";
import { requestJump } from "./ConversationThread";

/**
 * "Why this is here" — the top of the middle column (2026-10-06).
 *
 * The text is built by code (buildWhyText), never by a model (AI OS
 * CANON.P.001: code decides). Identical chips are grouped (AI OS CANON.K.009:
 * show only what the step needs).
 *
 * 2026-10-12 (Revin pattern): the card took about a third of the middle column
 * and left the thread a sliver. It is now one line, collapsed by default:
 * "Why: <text> · N issues ▸" plus a "Next issue ↓" that walks the flagged
 * messages in thread order. Expanding shows the full text and the grouped
 * issue list with a Jump per group, as before. The Where / Service area /
 * Estimate chips are gone: the Lead status card already shows all three, and
 * an opt-out is in the why text itself and in Lead status's channel pills.
 */

const OPEN_KEY = "botReview.whyOpen";
const OPEN_EVENT = "bot-review:why-open";
// Used when storage is blocked (private window), so the toggle still works for
// this page view even though the choice can't be remembered.
let memoryOpen = false;

/** Each flagged message once, in the order the issues list them (thread order). */
export function nextIssueAnchors(issues: Issue[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of issues) {
    if (!i.anchor || seen.has(i.anchor)) continue;
    seen.add(i.anchor);
    out.push(i.anchor);
  }
  return out;
}

function readOpen(): boolean {
  try {
    const v = window.localStorage.getItem(OPEN_KEY);
    return v == null ? memoryOpen : v === "1";
  } catch {
    return memoryOpen;
  }
}

function writeOpen(open: boolean) {
  memoryOpen = open;
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // Private window or blocked storage: the choice just isn't remembered.
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribeOpen(onChange: () => void) {
  window.addEventListener(OPEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function WhyCard({ text, issues }: { text: string; issues: Issue[] }) {
  // Collapsed on the server (and so during hydration), then the viewer's
  // remembered choice; the server HTML never disagrees with the first render.
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const [showAll, setShowAll] = useState(false);

  // 2026-10-07: identical chips are one line ("Sent after outbound paused × 4")
  // with one Jump, and the list stops at six lines. McKoy's card listed 16.
  const groups = groupIssues(issues);
  const shown = showAll ? groups : groups.slice(0, WHY_CARD_MAX_LINES);

  const anchors = useMemo(() => nextIssueAnchors(issues), [issues]);
  const anchorKey = anchors.join("|");
  // Where "Next issue" is, tied to the anchor list it walked: a new lead (a
  // new list) starts over at -1, "not started".
  const [walk, setWalk] = useState({ key: anchorKey, i: -1 });
  const cursor = walk.key === anchorKey ? walk.i : -1;

  function toggle() {
    writeOpen(!open);
  }

  function nextIssue() {
    if (anchors.length === 0) return;
    const i = (cursor + 1) % anchors.length;
    setWalk({ key: anchorKey, i });
    requestJump(anchors[i]!);
  }

  const count = issues.length;

  return (
    <section
      aria-label="Why this is here"
      className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex min-h-8 min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="why-details"
          className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          )}
          <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">Why</span>
          {open ? (
            <span className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-400">this is here</span>
          ) : (
            <span className="min-w-0 truncate text-navy-900 dark:text-white">{text}</span>
          )}
          {count > 0 && (
            <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400">
              · {count} issue{count === 1 ? "" : "s"}
            </span>
          )}
        </button>
        {anchors.length > 0 && (
          <button
            type="button"
            onClick={nextIssue}
            className="min-h-8 shrink-0 rounded-md px-2 text-xs font-medium text-navy-700 hover:bg-slate-100 hover:underline dark:text-navy-200 dark:hover:bg-slate-800"
            aria-label="Go to the next flagged message"
          >
            Next issue{cursor >= 0 && anchors.length > 1 ? ` ${cursor + 1}/${anchors.length}` : ""} ↓
          </button>
        )}
      </div>

      {open && (
        // A long "Show all" list scrolls inside itself at lg, so it never squeezes
        // the thread to nothing.
        <div id="why-details" className="pb-2 lg:max-h-[40vh] lg:overflow-y-auto">
          <p className="break-words text-sm leading-relaxed text-navy-900 dark:text-white">{text}</p>

          {count > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <ul className="flex flex-col gap-1">
                {shown.map((g) => (
                  <li key={g.label} className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        g.tone === "rose"
                          ? "bg-brick-700 text-white dark:bg-brick-600"
                          : "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
                      )}
                    >
                      {g.label}
                      {g.count > 1 ? ` × ${g.count}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => requestJump(g.anchors[0]!)}
                      className="shrink-0 rounded px-2 py-1.5 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
                      aria-label={`Jump to the first message: ${g.label}`}
                    >
                      Jump
                    </button>
                  </li>
                ))}
              </ul>
              {groups.length > WHY_CARD_MAX_LINES && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-1 py-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
                >
                  {showAll ? "Show less" : `Show all ${groups.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
