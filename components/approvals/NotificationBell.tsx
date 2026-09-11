"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markNotificationRead } from "@/lib/actions/approvals";
import { usePolledJson } from "@/lib/usePolledJson";
import { relTime } from "@/lib/utils";
import type { AppNotification } from "@/lib/supabase/types";

const POLL_MS = 25_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const polled = usePolledJson<{ items: AppNotification[]; unread: number }>(
    "/api/notifications",
    POLL_MS,
  );

  /*
   * The server list is the source of truth; this set is only the rows the user
   * has clicked since the last poll. Previously the list AND the unread count
   * were both held in state and patched by hand on click, so a poll landing
   * mid-interaction could resurrect a notification the user had just read. An
   * overlay avoids that: the poll always wins on content, the overlay only ever
   * turns `read` on, and once the server agrees the entry is redundant.
   */
  const [readLocally, setReadLocally] = useState<Set<string>>(new Set());

  const items = useMemo(() => {
    const rows = polled?.items ?? [];
    return readLocally.size === 0
      ? rows
      : rows.map((n) => (readLocally.has(String(n.id)) ? { ...n, read: true } : n));
  }, [polled, readLocally]);

  // Derived, not tracked — one less thing that can disagree with the list.
  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openNotification(n: AppNotification) {
    if (!n.read) {
      setReadLocally((cur) => new Set(cur).add(String(n.id)));
      await markNotificationRead(n.id);
    }
    setOpen(false);
    if (n.asset_id) router.push(`/approvals/${n.asset_id}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-slate-300 hover:bg-navy-800 hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brick px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-2 max-h-96 w-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      n.read ? "text-slate-500" : "font-medium text-navy-900 dark:text-slate-100"
                    }`}
                  >
                    {n.body}
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                      {relTime(n.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
