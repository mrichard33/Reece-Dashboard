import { UserCircle2 } from "lucide-react";

/**
 * Current-view badge shown in the top bar. The view (Operator / Team) reflects
 * the signed-in account's role — role is granted by the account (Settings →
 * Users), not chosen here, so this is a read-only STATUS, deliberately styled
 * as a single labeled badge rather than a segmented control: the old two-pill
 * design looked like clickable tabs, and "the Operator/Team tabs don't work"
 * was the predictable bug report. Admins change roles in Settings.
 */
export function RoleToggle({ role }: { role: "operator" | "team" }) {
  const label = role === "operator" ? "Operator" : "Team";
  return (
    <span
      className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 sm:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
      title="Your view is set by your account role — admins can change it in Settings → Users."
    >
      <UserCircle2 size={13} aria-hidden className="text-slate-400 dark:text-slate-500" />
      <span>
        View:{" "}
        <span className="font-semibold text-navy-900 dark:text-white">{label}</span>
      </span>
    </span>
  );
}
