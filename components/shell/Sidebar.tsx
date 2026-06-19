"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { NotificationBell } from "@/components/approvals/NotificationBell";
import { useMobileNav } from "@/components/shell/MobileNav";
import { useAttention } from "@/components/shell/useAttention";
import { NAV_GROUPS, type NavItem } from "@/components/shell/navConfig";
import { cn } from "@/lib/utils";

export function Sidebar({
  role,
  isExecutive,
  isAdmin,
  isExecOnly,
  currentPath,
}: {
  role: "operator" | "team";
  isExecutive: boolean;
  isAdmin: boolean;
  isExecOnly: boolean;
  currentPath: string;
}) {
  const { open, setOpen } = useMobileNav();
  const attention = useAttention();
  const [query, setQuery] = useState("");

  const canSee = (i: NavItem) => {
    // Content (FB engine) is open to operators AND executives — including
    // approver-only execs, who would otherwise be filtered out below.
    if (i.href === "/content") return isExecutive || role === "operator";
    if (i.audience === "admin") return isAdmin;
    if (i.audience === "executive") return isExecutive;
    // Approver-only executives see nothing but the Executive Review tab.
    if (isExecOnly) return false;
    return i.audience === "all" || role === "operator";
  };

  const q = query.trim().toLowerCase();
  const matches = (i: NavItem) =>
    q === "" ||
    i.label.toLowerCase().includes(q) ||
    i.desc.toLowerCase().includes(q);

  // Resolve a nav item's badge count from the shared attention poll.
  const badgeFor = (i: NavItem): number | null => {
    if (!i.badge || !attention) return null;
    const n =
      i.badge === "issues"
        ? attention.openIssues
        : attention.approvalsWaiting;
    return n > 0 ? n : null;
  };

  const groups = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => canSee(i) && matches(i)),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Backdrop — mobile only, when the drawer is open. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-navy-950/50 backdrop-blur-[1px] md:hidden"
        />
      )}

      <aside
        className={cn(
          // Off-canvas drawer below md; static column at md+.
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-navy-700 bg-navy-900 text-slate-200 transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-navy-700 px-4 py-4">
          <div className="flex items-center gap-2">
            <Image
              src="/reece-logo.png"
              alt="Reece Windows & Doors"
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-contain"
              priority
            />
            <div className="leading-tight">
              <p className="font-display text-sm font-bold tracking-wide text-white">
                REECE
              </p>
              <p className="text-[10px] uppercase tracking-wider text-navy-300">
                Mission Control
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isExecutive && <NotificationBell />}
            {/* Close affordance — mobile only. */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="rounded-md p-1 text-navy-300 hover:bg-navy-800 hover:text-white md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search — filters the nav by label / description. */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-navy-700 bg-navy-800 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-navy-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search navigation"
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-navy-300 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-navy-300 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="hidden rounded bg-navy-700 px-1 text-[10px] text-navy-300 sm:inline">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 text-sm">
          {groups.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-navy-300">No matches.</p>
          )}
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-navy-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const { href, label, desc, Icon, phase } = item;
                  const active =
                    currentPath === href || currentPath.startsWith(href + "/");
                  const stub = phase !== undefined;
                  const badge = badgeFor(item);

                  const inner = (
                    <>
                      {active && (
                        <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brick" />
                      )}
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate font-medium">{label}</span>
                        <span className="block truncate text-[11px] text-navy-300">
                          {desc}
                        </span>
                      </span>
                      {stub ? (
                        <span className="mt-0.5 rounded bg-navy-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          P{phase}
                        </span>
                      ) : (
                        badge !== null && (
                          <span
                            className={cn(
                              "mt-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white",
                              item.badge === "issues"
                                ? "bg-brick"
                                : "bg-amber-500",
                            )}
                          >
                            {badge}
                          </span>
                        )
                      )}
                    </>
                  );

                  const base =
                    "relative flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition";

                  if (stub) {
                    return (
                      <button
                        key={href}
                        type="button"
                        disabled
                        className={cn(
                          base,
                          "cursor-not-allowed text-slate-300 opacity-60",
                        )}
                      >
                        {inner}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={href}
                      href={href as never}
                      onClick={() => setOpen(false)}
                      className={cn(
                        base,
                        active
                          ? "bg-navy-700 text-white"
                          : "text-slate-300 hover:bg-navy-800 hover:text-white",
                      )}
                    >
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-navy-700 px-4 py-3 text-[11px] text-navy-300">
          <p className="font-medium">
            {isExecOnly ? "Executive" : role === "operator" ? "Operator" : "Team"} view
          </p>
          <p className="mt-0.5">Phase 1 build</p>
        </div>
      </aside>
    </>
  );
}
