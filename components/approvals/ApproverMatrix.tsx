import { Check, X, Clock } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import type { ApprovalWithExec } from "@/lib/queries/approvals";

/**
 * Shows the required approvers as chips with their decision state. Rejection
 * reasons surface on hover. Non-required approvals are not shown.
 */
export function ApproverMatrix({ approvals }: { approvals: ApprovalWithExec[] }) {
  const required = approvals.filter((a) => a.required);
  if (required.length === 0) {
    return (
      <p className="text-[11px] italic text-slate-400">No required approvers yet</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {required.map((a) => {
        const name = a.executive?.name ?? "Unknown";
        const chip = (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              a.decision === "approved" &&
                "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
              a.decision === "rejected" &&
                "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
              a.decision === "pending" &&
                "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
            )}
          >
            {a.decision === "approved" && <Check className="h-3 w-3" />}
            {a.decision === "rejected" && <X className="h-3 w-3" />}
            {a.decision === "pending" && <Clock className="h-3 w-3" />}
            {name}
          </span>
        );

        if (a.decision === "rejected" && a.reason) {
          return (
            <Tooltip key={a.id} label={a.reason}>
              {chip}
            </Tooltip>
          );
        }
        return <span key={a.id}>{chip}</span>;
      })}
    </div>
  );
}
