import Link from "next/link";
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
} from "lucide-react";
import { NotificationBell } from "@/components/approvals/NotificationBell";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** "all" = any role; "operator" = operators; "executive" = Exec-Review members. */
  audience: "all" | "operator" | "executive";
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
];

export function Sidebar({
  role,
  isExecutive,
  isExecOnly,
  currentPath,
}: {
  role: "operator" | "team";
  isExecutive: boolean;
  isExecOnly: boolean;
  currentPath: string;
}) {
  const visible = items.filter((i) => {
    // Content (FB engine) is open to operators AND executives — including
    // approver-only execs, who would otherwise be filtered out below.
    if (i.href === "/content") return isExecutive || role === "operator";
    if (i.audience === "executive") return isExecutive;
    // Approver-only executives see nothing but the Executive Review tab.
    if (isExecOnly) return false;
    return i.audience === "all" || role === "operator";
  });

  return (
    <aside className="flex w-56 flex-col border-r border-navy-700 bg-navy-900 text-slate-200">
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-navy-700">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-brick" />
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-white">Mission Control</p>
            <p className="text-[10px] uppercase tracking-wider text-navy-300">
              Reece W&amp;D
            </p>
          </div>
        </div>
        {isExecutive && <NotificationBell />}
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
  );
}
