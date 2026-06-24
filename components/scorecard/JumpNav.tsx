import { Gauge, Filter, Target, Layers, ListChecks, BookOpen, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const SECTIONS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "sc-pace", label: "Pace", Icon: Gauge },
  { id: "sc-funnel", label: "Funnel", Icon: Filter },
  { id: "sc-rates", label: "Rates", Icon: Target },
  { id: "sc-revenue", label: "Revenue", Icon: Layers },
  { id: "sc-status", label: "Status", Icon: ListChecks },
  { id: "sc-glossary", label: "Glossary", Icon: BookOpen },
  { id: "sc-goals", label: "Goals", Icon: SlidersHorizontal },
];

/**
 * Sticky "On this page" anchor chips. Native `#id` scrolling (no scrollIntoView,
 * which fights the shell's own scroll). Horizontally scrollable on narrow widths.
 */
export function JumpNav() {
  return (
    <nav className="sticky top-0 z-20 -mx-1 bg-slate-50/90 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70 dark:bg-slate-950/90 dark:supports-[backdrop-filter]:bg-slate-950/70">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 pr-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          On this page
        </span>
        {SECTIONS.map(({ id, label, Icon }) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 text-[12px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Icon size={13} className="text-slate-400" />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
