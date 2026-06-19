import { cn } from "@/lib/utils";

/**
 * Operator / Team segmented control shown in the top bar. The active segment
 * reflects the signed-in account's role — role is granted by the account, not
 * chosen here, so the control is presentational (it announces "which view am I
 * in", matching the Mission Control design).
 */
export function RoleToggle({ role }: { role: "operator" | "team" }) {
  const segments: Array<{ value: "operator" | "team"; label: string }> = [
    { value: "operator", label: "Operator" },
    { value: "team", label: "Team" },
  ];

  return (
    <div
      className="hidden items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 sm:flex dark:border-slate-700 dark:bg-slate-800"
      role="group"
      aria-label="Current view"
      title="Your view is set by your account role"
    >
      {segments.map((s) => (
        <span
          key={s.value}
          aria-current={role === s.value}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition",
            role === s.value
              ? "bg-white text-navy-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-400 dark:text-slate-500",
          )}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}
