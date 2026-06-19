"use client";

import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  GitBranch,
  Workflow,
  Bot,
  Users,
  Calendar,
  CalendarRange,
  AlertTriangle,
  Cog,
  ShieldCheck,
  X,
} from "lucide-react";
import { NotificationBell } from "@/components/approvals/NotificationBell";
import { IssuesNavBadge } from "@/components/issues/IssuesNavBadge";
import { useMobileNav } from "@/components/shell/MobileNav";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** "all" = any role; "operator" = operators; "executive" = Exec-Review members;
   *  "admin" = admin executives (Mark) only. */
  audience: "all" | "operator" | "executive" | "admin";
  /** Phase 2+ — link is rendered as a stub. */
  phase?: 2 | 3;
};

const items: NavItem[] = [
  { href: "/overview", label: "Overview", Icon: LayoutDashboard, audience: "all" },
  { href: "/pipelines", label: "Pipelines", Icon: GitBranch, audience: "all" },
  { href: "/workflows", label: "Workflows", Icon: Workflow, audience: "operator" },
  { href: "/agent", label: "Decision Engine", Icon: Bot, audience: "operator", phase: 2 },
  { href: "/leads", label: "Leads", Icon: Users, audience: "all", phase: 2 },
  { href: "/appointments", label: "Appointments", Icon: Calendar, audience: "all", phase: 3 },
  { href: "/issues", label: "Issues", Icon: AlertTriangle, audience: "operator" },
  { href: "/approvals", label: "Executive Review", Icon: ShieldCheck, audience: "executive" },
  { href: "/content", label: "Content", Icon: CalendarRange, audience: "all" },
  { href: "/ops/events", label: "Ops Logs", Icon: Cog, audience: "operator", phase: 3 },
  { href: "/settings", label: "Settings", Icon: Cog, audience: "admin" },
];

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

  const visible = items.filter((i) => {
    // Content (FB engine) is open to operators AND executives — including
    // approver-only execs, who would otherwise be filtered out below.
    if (i.href === "/content") return isExecutive || role === "operator";
    // Settings (connection config) is admin-only (Mark).
    if (i.audience === "admin") return isAdmin;
    if (i.audience === "executive") return isExecutive;
    // Approver-only executives see nothing but the Executive Review tab.
    if (isExecOnly) return false;
    return i.audience === "all" || role === "operator";
  });

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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-navy-700 bg-navy-900 text-slate-200 transition-transform duration-200 md:static md:z-auto md:w-56 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-navy-700">
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
              <p className="font-display text-sm font-semibold text-white">Mission Control</p>
              <p className="text-[10px] uppercase tracking-wider text-navy-300">
                Reece W&amp;D
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

      <nav className="flex-1 space-y-0.5 px-2 py-3 text-sm">
        {visible.map(({ href, label, Icon, phase }) => {
          const active = currentPath === href || currentPath.startsWith(href + "/");
          const stub = phase !== undefined;
          const baseClass =
            "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition text-left";
          const inner = (
            <>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </span>
              {stub && (
                <span className="rounded bg-navy-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  P{phase}
                </span>
              )}
              {href === "/issues" && <IssuesNavBadge />}
            </>
          );

          if (stub) {
            return (
              <button
                key={href}
                type="button"
                disabled
                className={[
                  baseClass,
                  "cursor-not-allowed opacity-60 text-slate-300",
                ].join(" ")}
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
              className={[
                baseClass,
                active
                  ? "bg-navy-700 text-white"
                  : "text-slate-300 hover:bg-navy-800 hover:text-white",
              ].join(" ")}
            >
              {inner}
            </Link>
          );
        })}
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
