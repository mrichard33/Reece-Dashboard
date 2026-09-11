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
  Gauge,
  BookOpen,
  Scale,
  MessageSquareQuote,
} from "lucide-react";

/** Which attention count (if any) drives this item's nav badge. */
export type NavBadge = "issues" | "approvals";

export type NavItem = {
  href: string;
  label: string;
  /** Plain-language second line shown under the label in the sidebar. */
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** "all" = any role; "operator" = operators; "executive" = Exec-Review
   *  members; "admin" = admin executives (Mark) only. */
  audience: "all" | "operator" | "executive" | "admin";
  /** Phase 2+ — link renders as a disabled stub. */
  phase?: 2 | 3;
  badge?: NavBadge;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * The grouped left-nav information architecture (Mission Control design).
 * A single source of truth shared by the Sidebar and the TopBar breadcrumb.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Start here",
    items: [
      {
        href: "/overview",
        label: "Overview",
        desc: "Your morning glance",
        Icon: LayoutDashboard,
        audience: "all",
      },
    ],
  },
  {
    label: "Needs you",
    items: [
      {
        href: "/command-center",
        label: "Command Center",
        desc: "Rule, review, roll back",
        Icon: Scale,
        audience: "operator",
      },
      {
        // Reviewers are operators AND team members (team reviews count once
        // they calibrate), so this is audience "all" — the page itself sends
        // exec-only users away and limits team to Review + Compare.
        href: "/bot-review",
        label: "Bot review",
        desc: "Score what the bot said",
        // The design asks for message-check; this lucide version has no such
        // icon, and a quoted message reads the same way for "the message under
        // review". Swap it if the icon set gains message-square-check.
        Icon: MessageSquareQuote,
        audience: "all",
      },
      {
        href: "/approvals",
        label: "Executive Review",
        desc: "Decisions waiting on you",
        Icon: ShieldCheck,
        audience: "executive",
        badge: "approvals",
      },
      {
        href: "/issues",
        label: "Issues",
        desc: "Problems to fix",
        Icon: AlertTriangle,
        audience: "operator",
        badge: "issues",
      },
    ],
  },
  {
    label: "The pipeline",
    items: [
      {
        href: "/pipelines",
        label: "Pipelines",
        desc: "Where every deal stands",
        Icon: GitBranch,
        audience: "all",
      },
      {
        href: "/scorecard",
        label: "Scorecard",
        desc: "Goal & variance vs plan",
        Icon: Gauge,
        audience: "all",
      },
      {
        href: "/guide",
        label: "Page Metrics",
        desc: "Guide & WP journey performance",
        Icon: BookOpen,
        audience: "all",
      },
      {
        href: "/workflows",
        label: "Workflows",
        desc: "Automations running for you",
        Icon: Workflow,
        audience: "operator",
      },
      {
        href: "/agent",
        label: "Decision Engine",
        desc: "The decision engine, live",
        Icon: Bot,
        audience: "operator",
        phase: 2,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/leads",
        label: "Leads",
        desc: "New people coming in",
        Icon: Users,
        audience: "all",
        phase: 2,
      },
      {
        href: "/appointments",
        label: "Appointments",
        desc: "Today's schedule",
        Icon: Calendar,
        audience: "all",
        phase: 3,
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/content",
        label: "Content",
        desc: "Facebook post engine",
        Icon: CalendarRange,
        audience: "all",
      },
      {
        href: "/ops/events",
        label: "Ops Logs",
        desc: "Raw operational logs",
        Icon: Cog,
        audience: "operator",
        phase: 3,
      },
      {
        href: "/settings",
        label: "Settings",
        desc: "Connections & config",
        Icon: Cog,
        audience: "admin",
      },
    ],
  },
];

/** Flat list of every nav item (any group), for path lookups. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Resolve the nav item that owns a given pathname — longest matching href
 * wins so `/approvals/123` resolves to the Executive Review entry. Used by the
 * breadcrumb.
 */
export function findNavItem(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
