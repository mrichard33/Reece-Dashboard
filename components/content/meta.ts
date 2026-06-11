import type { BadgeTone } from "@/components/ui/Badge";
import type {
  FbPost,
  FbPostStatus,
  FbPlanStatus,
  FbComponentStatus,
  FbPillar,
  FbTarget,
  FbArchetype,
  FbReasonCode,
} from "@/lib/supabase/types";

/**
 * Calendar status colours (shared legend).
 * Green progression (Mark's spec): approved = light green (mint) → published to
 * Facebook = full green (emerald). 'posted' means BOTH legs done for target='both'.
 */
export const FB_STATUS_META: Record<FbPostStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "navy" },
  approved: { label: "Approved", tone: "mint" },
  posted: { label: "Posted", tone: "emerald" },
  skipped: { label: "Skipped", tone: "slate" },
};

/**
 * Effective publish state for a post — the page-leg-aware view of status.
 * A target='both' post stays status='approved' after the Page leg publishes
 * (it awaits the human Group leg), but visually it has "gone green":
 * page_posted_at set ⇒ full emerald.
 */
export function postPublishMeta(
  post: Pick<FbPost, "status" | "page_posted_at">,
): { label: string; tone: BadgeTone } {
  if (post.status === "approved" && post.page_posted_at) {
    return { label: "Posted to Page", tone: "emerald" };
  }
  return FB_STATUS_META[post.status];
}

/** Plan-slot statuses (fb_content_plan). 'planned' is the new muted calendar state. */
export const PLAN_STATUS_META: Record<FbPlanStatus, { label: string; tone: BadgeTone }> = {
  planned: { label: "Planned", tone: "sky" },
  generated: { label: "Generated", tone: "navy" },
  skipped: { label: "Skipped", tone: "slate" },
};

export const COMPONENT_STATUS_META: Record<FbComponentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "rose" },
};

/** The 8 content pillars (rotation axis 1). Order is the canonical list. */
export const PILLARS: FbPillar[] = [
  "storm",
  "noise",
  "energy",
  "security",
  "comfort",
  "insurance",
  "uv",
  "value",
];

export const PILLAR_META: Record<FbPillar, { label: string; tone: BadgeTone }> = {
  storm: { label: "Storm", tone: "navy" },
  noise: { label: "Noise", tone: "sky" },
  energy: { label: "Energy", tone: "amber" },
  security: { label: "Security", tone: "rose" },
  comfort: { label: "Comfort", tone: "emerald" },
  insurance: { label: "Insurance", tone: "brick" },
  uv: { label: "UV", tone: "amber" },
  value: { label: "Value", tone: "slate" },
};

/** The 8 archetypes (rotation axis 2). */
export const ARCHETYPES: FbArchetype[] = [
  "myth-bust",
  "secret-reveal",
  "story",
  "mistake-expose",
  "seasonal",
  "thought-leadership",
  "community-cause",
  "social-proof",
];

export const ARCHETYPE_LABEL: Record<FbArchetype, string> = {
  "myth-bust": "Myth-bust",
  "secret-reveal": "Secret reveal",
  story: "Story",
  "mistake-expose": "Mistake expose",
  seasonal: "Seasonal",
  "thought-leadership": "Thought leadership",
  "community-cause": "Community cause",
  "social-proof": "Social proof",
};

export const TARGET_META: Record<FbTarget, { label: string; tone: BadgeTone }> = {
  group: { label: "Group", tone: "sky" },
  page: { label: "Page", tone: "navy" },
  both: { label: "Page + Group", tone: "slate" },
};

/** Rejection reason codes (matches the fb_post_feedback CHECK constraint). */
export const REASON_CODES: { value: FbReasonCode; label: string }[] = [
  { value: "off-brand", label: "Off-brand" },
  { value: "weak-hook", label: "Weak hook" },
  { value: "wrong-pillar-fit", label: "Wrong pillar fit" },
  { value: "compliance-risk", label: "Compliance risk" },
  { value: "too-salesy", label: "Too salesy" },
  { value: "inaccurate", label: "Inaccurate" },
  { value: "image-mismatch", label: "Image mismatch" },
  { value: "image-quality", label: "Image quality" },
  { value: "other", label: "Other" },
];

export const REASON_LABEL: Record<FbReasonCode, string> = REASON_CODES.reduce(
  (acc, r) => ({ ...acc, [r.value]: r.label }),
  {} as Record<FbReasonCode, string>,
);

/** Format a stored Eastern wall-clock time ("HH:MM[:SS]") as "9:00 AM ET". */
export function formatPostTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period} ET`;
}

/** Tolerant lookups (DB columns are free-text, so guard unknown values). */
export function pillarLabel(p: string | null | undefined): string {
  if (!p) return "—";
  return (PILLAR_META as Record<string, { label: string }>)[p]?.label ?? p;
}

export function pillarTone(p: string | null | undefined): BadgeTone {
  if (!p) return "slate";
  return (PILLAR_META as Record<string, { tone: BadgeTone }>)[p]?.tone ?? "slate";
}

export function archetypeLabel(a: string | null | undefined): string {
  if (!a) return "—";
  return (ARCHETYPE_LABEL as Record<string, string>)[a] ?? a;
}
