import {
  LayoutDashboard,
  GitBranch,
  Workflow,
  Bot,
  Users,
  Calendar,
  CalendarRange,
  Cog,
  ShieldCheck,
  Gauge,
  BookOpen,
  Scale,
  MessageSquareQuote,
  PhoneMissed,
  Wallet,
  Mail,
  Activity,
  Receipt,
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
  /** Other pages this item owns (its tabs): the item reads active on them. */
  also?: string[];
};

/** Is `pathname` this item's page, one of its sub-pages, or one of its tabs? */
export function itemOwnsPath(item: Pick<NavItem, "href" | "also">, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));
}

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
        // 2026-10-15 (the user): System health, Incidents and Issues overlapped
        // as three menu items. One item; Overview / Incidents / Issues are tabs
        // on its pages (components/health/HealthTabs.tsx). The URLs are unchanged.
        href: "/system-health",
        label: "System health",
        desc: "Checks, incidents and issues",
        Icon: Activity,
        audience: "all",
        badge: "issues",
        also: ["/incidents", "/issues"],
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
        // 2026-10-19: every marketing cost (software, call center, commissions,
        // held money) and the invoices. Its own item, not under /scorecard,
        // which is for sales; Sources & lead cost keeps lead sources only.
        href: "/marketing-spend",
        label: "Marketing Spend",
        desc: "Every marketing cost & invoice",
        Icon: Receipt,
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
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/leads",
        label: "Leads",
        desc: "Every lead's full journey",
        Icon: Users,
        audience: "all",
      },
      {
        // Leads we should be calling and are not, and how long leads wait for
        // a first call — Five9 call records, from LP-MCP's Lead Leak Monitor.
        href: "/lead-leaks",
        label: "Lead Leaks",
        desc: "Leads we haven't called",
        Icon: PhoneMissed,
        audience: "operator",
      },
      {
        // Partner payroll (2026-09-27): LightFire's weekly pay lines by program
        // and its dispute tickets. Partners see their own copy at
        // /partner/payroll, outside this shell.
        href: "/payroll",
        label: "Payroll",
        desc: "Partner pay and disputes",
        Icon: Wallet,
        audience: "operator",
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
        href: "/modes",
        label: "Test-mode features",
        desc: "Which features are live or still testing",
        Icon: Gauge,
        audience: "operator",
      },
      {
        href: "/vendor-reports",
        label: "Vendor reports",
        desc: "Weekly lead-status emails to lead vendors",
        Icon: Mail,
        audience: "operator",
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
    if (itemOwnsPath(item, pathname)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}
