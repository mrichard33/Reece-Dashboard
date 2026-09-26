import { ThemeToggle } from "./ThemeToggle";
import { SyncNowButton } from "./SyncNowButton";
import { MobileNavToggle } from "./MobileNav";
import { Breadcrumb } from "./Breadcrumb";
import { AttentionChips } from "./AttentionChips";
import { RoleToggle } from "./RoleToggle";

export function TopBar({
  email,
  role,
  title,
  actions,
  syncNow = false,
}: {
  email: string;
  role: "operator" | "team";
  /** Fallback breadcrumb label for routes without a nav entry. */
  title: string;
  /** Optional subtitle — kept for API compatibility; the breadcrumb now
   *  carries the section description. */
  subtitle?: string;
  actions?: React.ReactNode;
  /** Render the global Sync now button. Opt-in PER PAGE: pass true only on
   *  pages whose data the LP/HL `sync_all_entities` runs actually refresh
   *  (Overview, Pipelines, Workflows). Everywhere else the button was a no-op
   *  that still fired two heavy MCP syncs. */
  syncNow?: boolean;
}) {
  return (
    // 2026-09-26: below sm the header wraps — a page's `actions` plus Sync now
    // plus the avatar did not fit beside the breadcrumb at 375px and pushed the
    // page sideways. The right cluster drops under the breadcrumb and wraps
    // itself; sm+ is the original single nowrap row.
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-nowrap sm:px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <MobileNavToggle />
        <Breadcrumb fallback={title} />
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3">
        {actions}
        <AttentionChips />
        <RoleToggle role={role} />
        {syncNow && <SyncNowButton />}
        <ThemeToggle />
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
          <div className="h-7 w-7 rounded-full bg-navy-700 text-center font-display text-xs font-semibold leading-7 text-white">
            {email.slice(0, 1).toUpperCase()}
          </div>
          <div className="hidden text-right md:block">
            <p className="text-xs font-medium text-slate-800 dark:text-slate-100">
              {email}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
