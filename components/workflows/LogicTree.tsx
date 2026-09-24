import type { LogicLine } from "@/lib/journey/workflowGraph";
import { cn } from "@/lib/utils";

/** Steps in order, indented by enclosing branch — no graph library needed. */
export function LogicTree({ lines }: { lines: LogicLine[] }) {
  if (lines.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No steps cached for this workflow.</p>;
  return (
    <ol className="space-y-0.5 font-mono text-xs">
      {lines.map((l) => (
        <li
          key={l.id}
          style={{ paddingLeft: `${Math.min(l.depth, 14) * 14}px` }}
          className={cn(
            "break-words py-0.5",
            l.branch ? "font-semibold text-navy-800 dark:text-sky-300" : "text-slate-700 dark:text-slate-300",
            l.type === "if_else" && !l.branch && "text-amber-800 dark:text-amber-300",
            (l.type === "email" || l.type === "sms") && "text-emerald-800 dark:text-emerald-300",
          )}
        >
          <span className="mr-2 text-slate-400">{l.order}</span>
          {l.text}
        </li>
      ))}
    </ol>
  );
}
