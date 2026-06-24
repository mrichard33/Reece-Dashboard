import type { ReactNode } from "react";

/** Small marks reused by chart mini-legends and the glossary key. */
export const MarkBar = ({ color }: { color: string }) => (
  <span className="h-2.5 w-4 rounded-sm" style={{ background: color }} />
);

export const MarkTick = () => (
  <span className="relative inline-block h-3.5 w-3">
    <span className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 rounded bg-slate-500 dark:bg-slate-300" />
  </span>
);

export const MarkDot = ({ color = "#94A3B8" }: { color?: string }) => (
  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
);

export const MarkChip = () => (
  <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">
    <ArrowDownGlyph />
  </span>
);

function ArrowDownGlyph() {
  // Inline 10px down-arrow (lucide ArrowDown geometry) to avoid a client import.
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-slate-400" aria-hidden>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

/** A small mark + label row, used inside <MiniLegend>. */
export function MiniLegend({ items }: { items: { mark: ReactNode; label: string }[] }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {it.mark}
          <span>{it.label}</span>
        </span>
      ))}
    </div>
  );
}
