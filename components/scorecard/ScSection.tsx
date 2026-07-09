import type { ReactNode } from "react";

/**
 * Scorecard section shell (v3 look). A flat rounded card with a compact header:
 * an uppercase display label, an optional muted em-dash descriptor, and an
 * optional right-aligned meta line. Deliberately lighter than `ScCard` — no
 * lead sentence, no InfoPopover, no badge — to match the approved prototype.
 *
 * `accentTop` paints a thick top border (e.g. navy / sky) for the Sold-vs-Net
 * cards; it overrides the default hairline top border.
 */
export function ScSection({
  id,
  label,
  tail,
  meta,
  accentTop = "",
  bodyClassName = "",
  children,
}: {
  id?: string;
  label: ReactNode;
  tail?: ReactNode;
  meta?: ReactNode;
  accentTop?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 ${accentTop}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pb-3 pt-4">
        <h3 className="font-display text-[12.5px] font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
          {label}
          {tail && (
            <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
              — {tail}
            </span>
          )}
        </h3>
        {meta && (
          <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{meta}</div>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
