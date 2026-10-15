import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/**
 * The three views of System health (the user, 2026-10-15: System Health,
 * Incidents and Issues overlapped as three menu items):
 *   Overview  — every check, every system, now and over 24 hours
 *   Incidents — what the checks found broken, one per problem
 *   Issues    — problems people filed, data drift, stuck contacts
 * Incidents and Issues are operator pages, so a non-operator sees no tabs.
 * Scrolls sideways on a phone rather than wrapping.
 */
const TABS = [
  { href: "/system-health", label: "Overview" },
  { href: "/incidents", label: "Incidents" },
  { href: "/issues", label: "Issues" },
] as const;

export type HealthTab = (typeof TABS)[number]["href"];

export function HealthTabs({ current, role }: { current: HealthTab; role: string }) {
  if (role !== "operator") return null;
  return (
    <nav aria-label="System health views" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => {
          const active = t.href === current;
          return (
            <li key={t.href}>
              <Link
                href={t.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block min-h-[36px] border-b-2 px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-brick text-navy-900 dark:text-slate-100"
                    : "border-transparent text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
