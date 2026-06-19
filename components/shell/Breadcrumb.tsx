"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { findNavItem } from "./navConfig";

/**
 * Top-bar breadcrumb: "Mission Control › {section} · {description}". The section
 * label + description come from the shared nav config keyed on the current
 * path; for routes without a nav entry (e.g. a detail page) the `fallback`
 * title is used.
 */
export function Breadcrumb({ fallback }: { fallback?: string }) {
  const pathname = usePathname();
  const item = findNavItem(pathname ?? "");
  const label = item?.label ?? fallback ?? "";

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
    >
      <Link
        href="/overview"
        className="shrink-0 font-medium transition hover:text-navy-700 dark:hover:text-slate-200"
      >
        Mission Control
      </Link>
      {label && (
        <>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
          <span className="truncate font-semibold text-navy-900 dark:text-white">
            {label}
          </span>
          {item?.desc && (
            <span className="hidden truncate text-slate-400 sm:inline dark:text-slate-500">
              · {item.desc}
            </span>
          )}
        </>
      )}
    </nav>
  );
}
