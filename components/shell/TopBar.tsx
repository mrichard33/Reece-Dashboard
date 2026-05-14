import { ThemeToggle } from "./ThemeToggle";
import { SyncNowButton } from "./SyncNowButton";

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
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h1 className="font-display text-lg font-semibold text-navy-900 dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
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
