"use client";

import { useEffect, useState } from "react";
import { Activity, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_META } from "./meta";
import { relTime } from "@/lib/utils";
import type { ActivityCategory } from "@/lib/supabase/types";

export type FeedRow = {
  source: "event" | "post";
  id: string;
  body: string;
  actorName: string | null;
  category: ActivityCategory | null;
  created_at: string;
};

const POLL_MS = 25_000;

export function ActivityFeed({ initial }: { initial: FeedRow[] }) {
  const [items, setItems] = useState<FeedRow[]>(initial);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/activity-feed", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as FeedRow[];
        if (alive) setItems(data);
      } catch {
        /* transient — keep last good feed */
      }
    }
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-500">No activity yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={`${f.source}-${f.id}`} className="flex items-start gap-2.5">
          <span className="mt-0.5 text-slate-400">
            {f.source === "post" ? (
              <MessageSquare className="h-3.5 w-3.5" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-navy-900 dark:text-slate-200">
              {f.source === "post" && f.actorName ? (
                <span className="font-medium">{f.actorName}: </span>
              ) : null}
              {f.body}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[11px] text-slate-400">{relTime(f.created_at)}</span>
              {f.category && (
                <Badge tone={CATEGORY_META[f.category].tone}>
                  {CATEGORY_META[f.category].label}
                </Badge>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
