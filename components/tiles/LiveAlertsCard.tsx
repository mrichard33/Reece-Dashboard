import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { relTime } from "@/lib/utils";
import type { LiveAlert } from "@/lib/supabase/types";

export function LiveAlertsCard({ alerts }: { alerts: LiveAlert[] }) {
  if (alerts.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No conditions firing.</p>;
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const { stale } = a;
        return (
          <li key={a.label} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={stale ? "amber" : "rose"} dot>{stale ? "Stale" : "Firing"}</Badge>
              <p className="min-w-0 break-words text-sm font-semibold text-navy-900 dark:text-slate-100">{a.label}</p>
              {a.keys > 1 && <span className="text-[11px] text-slate-500">× {a.keys}</span>}
            </div>
            {a.detail && a.detail !== "[object Object]" && (
              <p className="mt-1 line-clamp-2 break-words text-xs text-slate-600 dark:text-slate-300">{a.detail}</p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              Since {relTime(a.first_seen_at)} · last seen {relTime(a.last_seen_at)}
            </p>
          </li>
        );
      })}
      <li className="pt-1 text-right">
        <Link href="/issues" className="text-xs font-medium text-navy-700 hover:underline dark:text-sky-400">
          Logged issues backlog →
        </Link>
      </li>
    </ul>
  );
}
