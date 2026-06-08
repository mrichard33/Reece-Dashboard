import { ThemeToggle } from "./ThemeToggle";
import { SyncNowButton } from "./SyncNowButton";
import { MobileNavToggle } from "./MobileNav";

export function TopBar({
  email,
  role,
  title,
  subtitle,
  actions,
}: {
  email: string;
  role: "operator" | "team";
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center">
        <MobileNavToggle />
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-semibold text-navy-900 sm:text-lg dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {actions}
        <SyncNowButton />
        <ThemeToggle />
        <div className="flex items-center gap-2 border-l border-slate-200 pl-4 dark:border-slate-700">
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
