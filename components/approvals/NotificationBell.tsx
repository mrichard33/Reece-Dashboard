"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markNotificationRead } from "@/lib/actions/approvals";
import { relTime } from "@/lib/utils";
import type { AppNotification } from "@/lib/supabase/types";

const POLL_MS = 25_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: AppNotification[]; unread: number };
        if (alive) {
          setItems(data.items);
          setUnread(data.unread);
        }
      } catch {
        /* transient */
      }
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

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
      await markNotificationRead(n.id);
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
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
