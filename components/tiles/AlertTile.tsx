import { AlertCircle } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { relTime } from "@/lib/utils";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

const severityTone: Record<NonNullable<ClaudeKnownIssue["severity"]>, BadgeTone> = {
  low: "slate",
  medium: "amber",
  high: "rose",
  critical: "brick",
};

export function AlertTile({ issue }: { issue: ClaudeKnownIssue }) {
  const tone: BadgeTone = issue.severity ? severityTone[issue.severity] : "slate";

  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone={tone} dot>
            {issue.severity ?? "unknown"}
          </Badge>
          {issue.owner && (
            <span className="text-[11px] text-slate-500">{issue.owner}</span>
          )}
        </div>
        <p className="mt-1 truncate text-sm text-navy-900 dark:text-slate-100">
          {issue.description}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Opened {relTime(issue.opened_at)}
        </p>
      </div>
    </div>
  );
}
