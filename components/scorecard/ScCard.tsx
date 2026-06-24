import type { ReactNode } from "react";
import { InfoPopover } from "@/components/help/InfoPopover";

/**
 * Shared scorecard section shell. White surface, hairline border, header row
 * (font-display title + optional circled-i InfoPopover + action/badge), an
 * optional plain-English `lead` line under the header hairline, then the body.
 * Each section carries an `id` + `scroll-mt-24` so the sticky jump-nav anchors
 * land cleanly. Distinct from `ui/Card` to match the handoff header spec.
 */
export function ScCard({
  id,
  title,
  info,
  badge,
  action,
  lead,
  children,
  className = "",
}: {
  id?: string;
  title: ReactNode;
  info?: { what: string; where: string; fix: string };
  badge?: ReactNode;
  action?: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-4 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate font-display text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {info && <InfoPopover info={info} align="left" />}
        </div>
        {(action || badge) && (
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {badge}
          </div>
        )}
      </div>
      {lead && (
        <p className="px-5 pt-3 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
          {lead}
        </p>
      )}
      {children}
    </section>
  );
}
