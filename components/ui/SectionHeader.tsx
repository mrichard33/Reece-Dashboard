/**
 * In-content page header (Mission Control design): a large display title with
 * an optional subtitle on the left and an optional primary action on the right.
 * Distinct from the global TopBar (which carries the breadcrumb + chips); this
 * sits at the top of a page's scrollable content.
 */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[22px] font-bold tracking-tight text-navy-900 dark:text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="w-full lg:w-auto lg:shrink-0">{action}</div>}
    </div>
  );
}
