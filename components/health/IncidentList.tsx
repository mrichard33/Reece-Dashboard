import Link from "next/link";
import type { Route } from "next";
import { Badge } from "@/components/ui/Badge";
import { formatDuration, SEVERITY_TONE, statusTone, type IncidentRow } from "@/lib/queries/incidents.core";
import { plainTimes, severityWord } from "@/lib/health/words";
import { usd } from "@/lib/utils";

/**
 * The open-incident list: how urgent (Urgent / High / Medium / Low, never the
 * P-code), status, title, one line of summary, age and money at risk. Stacks
 * on a phone.
 */
export function IncidentList({ rows, empty }: { rows: IncidentRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r) => (
        <li key={r.id} className="py-3">
          <Link href={`/incidents/${r.id}` as Route} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY_TONE[r.severity] ?? "slate"}>{severityWord(r.severity)}</Badge>
              <Badge tone={statusTone(r.status)}>{r.statusLabel}</Badge>
              {r.flapping && <Badge tone="brick">comes and goes</Badge>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium text-navy-900 underline-offset-2 hover:underline dark:text-slate-100">{plainTimes(r.title)}</span>
              {r.summary && <span className="block break-words text-xs text-slate-500 dark:text-slate-400">{plainTimes(r.summary)}</span>}
            </span>
            <span className="flex shrink-0 flex-wrap gap-x-3 text-xs text-slate-500">
              <span>open {formatDuration(r.ageMin)}</span>
              {r.valueAtRisk !== null && <span>{usd(r.valueAtRisk)} at risk</span>}
              {r.occurrences > 1 && <span>came back {r.occurrences - 1}x</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

