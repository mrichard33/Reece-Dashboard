"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/content", label: "Calendar" },
  { href: "/content/miner", label: "Idea Miner" },
  { href: "/content/insights", label: "Insights" },
  { href: "/content/message-bank", label: "Message Bank" },
  { href: "/content/settings", label: "Settings" },
] as const;

export function ContentNav() {
  const path = usePathname();
  return (
    // Five tabs are ~430px of text, wider than a phone: the strip scrolls
    // sideways there instead of pushing the whole page wide (2026-09-26).
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:px-6 dark:border-slate-800">
      {TABS.map((t) => {
        // Anchored prefix match: "/content/settings" must not light up for a
        // sibling like "/content/settings-v2" — only exact or a "/" boundary.
        const active =
          t.href === "/content"
            ? path === "/content"
            : path === t.href || path.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition",
              active
                ? "border-brick text-navy-900 dark:text-white"
                : "border-transparent text-slate-500 hover:text-navy-800 dark:hover:text-slate-200",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
