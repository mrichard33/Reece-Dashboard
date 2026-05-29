import type { BadgeTone } from "@/components/ui/Badge";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

/**
 * Translates the technical `claude_known_issues` shape into plain-language copy
 * for front-end users — a friendly title, a one-paragraph explanation, and
 * concrete recommended actions. Mirrors the { what, where, fix } philosophy of
 * components/help/helpContent.ts. Unknown categories fall back to a humanized
 * title and the raw description.
 */

export type SeverityMeta = { label: string; tone: BadgeTone };

export function severityMeta(severity: ClaudeKnownIssue["severity"]): SeverityMeta {
  switch (severity) {
    case "critical":
      return { label: "Critical — act now", tone: "brick" };
    case "high":
      return { label: "High priority", tone: "rose" };
    case "medium":
      return { label: "Medium", tone: "amber" };
    case "low":
      return { label: "Low", tone: "slate" };
    default:
      return { label: "Needs review", tone: "slate" };
  }
}

export type AlertCopy = {
  friendlyTitle: string;
  plainExplanation: string;
  recommendedActions: string[];
};

const CATEGORY_MAP: Record<string, AlertCopy> = {
  sync_error: {
    friendlyTitle: "Data sync problem",
    plainExplanation:
      "The dashboard couldn't pull the latest data from Lead Perfection or GoHighLevel, so some numbers may be out of date.",
    recommendedActions: [
      "Use the “Sync now” button in the top bar to retry.",
      "Check the System Health tiles to see which service is affected.",
    ],
  },
  drift: {
    friendlyTitle: "Records out of sync between systems",
    plainExplanation:
      "One or more leads show a different status in Lead Perfection than in GoHighLevel. This usually means a status update didn't carry across.",
    recommendedActions: [
      "Open Issues → Drift to see the affected leads.",
      "Update the lead's status manually if only a few are affected.",
    ],
  },
  contamination: {
    friendlyTitle: "Workflow messaging conflict",
    plainExplanation:
      "A workflow is sending messages that don't match where the contact is in the funnel — for example, a follow-up message firing at the wrong stage.",
    recommendedActions: [
      "Open Issues → Contamination to see the workflow.",
      "Review the workflow's messages in GoHighLevel.",
    ],
  },
  namespace: {
    friendlyTitle: "Conflicting contact tags",
    plainExplanation:
      "A contact has two tags that should never coexist (for example, two different stage tags), which can cause them to be handled twice or sent down the wrong path.",
    recommendedActions: [
      "Open Issues → Namespace to see affected contacts.",
      "Remove the older conflicting tag in GoHighLevel.",
    ],
  },
  workflow_health: {
    friendlyTitle: "Workflow problem",
    plainExplanation:
      "An automated workflow isn't behaving as expected — it may be failing, stalling contacts, or duplicating actions.",
    recommendedActions: [
      "Open the Workflows page to review its health flags.",
      "Check the workflow's recent executions in GoHighLevel.",
    ],
  },
  stuck: {
    friendlyTitle: "Stalled contacts",
    plainExplanation:
      "Open opportunities haven't moved stages in a while. A workflow may be broken, or deals may need a rep to follow up.",
    recommendedActions: [
      "Open Issues → Stuck contacts to review them.",
      "Confirm the workflow meant to advance them is running.",
    ],
  },
};

const ALIASES: Record<string, string> = {
  sync: "sync_error",
  sync_health: "sync_error",
  data_drift: "drift",
  drift_detection: "drift",
  namespace_violation: "namespace",
  workflow: "workflow_health",
  automation: "workflow_health",
  stuck_contacts: "stuck",
};

function humanize(category: string): string {
  return category
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function alertCopy(issue: ClaudeKnownIssue): AlertCopy {
  const raw = (issue.category ?? "").toLowerCase().trim();
  const key = CATEGORY_MAP[raw] ? raw : ALIASES[raw];
  const mapped = key ? CATEGORY_MAP[key] : undefined;

  if (mapped) return mapped;

  // Unknown category: present the raw description with a humanized title.
  return {
    friendlyTitle: issue.category ? humanize(issue.category) : "System alert",
    plainExplanation: issue.description,
    recommendedActions: ["Open the Issues page to review and resolve this alert."],
  };
}
