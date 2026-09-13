import type { BadgeTone } from "@/components/ui/Badge";
import type { ChangeStatus } from "@/lib/queries/changes";

/**
 * One place that decides what a change's status looks like.
 *
 * Same convention as components/content/meta.ts, including its colour
 * semantics: amber means queued or waiting on somebody, emerald means it
 * actually landed, rose means it needs attention. The distinction that matters
 * here is `in_review` vs `deployed` — a green PR is not a shipped change, and
 * colouring them alike is how a queue quietly stops being worked.
 */
export const CHANGE_STATUS_META: Record<ChangeStatus, { label: string; tone: BadgeTone; hint: string }> = {
  proposed: {
    label: "Proposed",
    tone: "slate",
    hint: "Waiting on you to approve, edit or reject it.",
  },
  approved: {
    label: "Approved",
    tone: "amber",
    hint: "Approved. Generate the prompt and hand it to Claude Code.",
  },
  testing: {
    label: "Testing",
    tone: "sky",
    hint: "A pull request is open and CI is still running.",
  },
  in_review: {
    label: "Ready to merge",
    tone: "amber",
    hint: "CI passed. Waiting on you to merge — merging deploys it.",
  },
  deployed: {
    label: "Deployed",
    tone: "emerald",
    hint: "Merged and shipped.",
  },
  failed: {
    label: "Failed",
    tone: "rose",
    hint: "CI failed, or the change reported a failure. Needs a look.",
  },
  rejected: {
    label: "Rejected",
    tone: "slate",
    hint: "Turned down, with the reason on the record.",
  },
  rolled_back: {
    label: "Rolled back",
    tone: "rose",
    hint: "Reversed after shipping.",
  },
};

/** The filter chips across the top of the lane, in the order they are worked. */
export const CHANGE_FILTERS = [
  { key: "open", label: "Needs work" },
  { key: "proposed", label: "Proposed" },
  { key: "approved", label: "Approved" },
  { key: "in_review", label: "Ready to merge" },
  { key: "failed", label: "Failed" },
  { key: "deployed", label: "Deployed" },
  { key: "", label: "All" },
] as const;
