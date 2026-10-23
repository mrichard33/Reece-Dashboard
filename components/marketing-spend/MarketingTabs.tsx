import Link from "next/link";
import type { Route } from "next";

type Tab = "spend" | "sources" | "invoices";

/**
 * One tab bar for the marketing pages (the user, 2026-10-19: "Simplifying this
 * navigation would make it easier"). Since 2026-10-23 all three live on
 * /marketing-spend and Sources & lead cost is the first, default tab (the
 * user: it "should be under Marketing Spend as the main tab"). The market and
 * period carry across, so switching tabs keeps what you picked.
 */
export function MarketingTabs({ active, carry }: { active: Tab; carry: Record<string, string | undefined> }) {
  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...carry, ...extra })) if (v) p.set(k, v);
    return p.size ? `?${p.toString()}` : "";
  };
  const tabs: { key: Tab; label: string; href: Route }[] = [
    { key: "sources", label: "Sources & lead cost", href: `/marketing-spend${qs()}` as Route },
    { key: "spend", label: "Spend", href: `/marketing-spend${qs({ tab: "spend" })}` as Route },
    { key: "invoices", label: "Invoices", href: `/marketing-spend${qs({ tab: "invoices" })}` as Route },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Marketing">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={
            active === t.key
              ? "border-b-2 border-navy-700 px-3 py-2 text-sm font-medium text-navy-900 dark:border-slate-200 dark:text-slate-100"
              : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
