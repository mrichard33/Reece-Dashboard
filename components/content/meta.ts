import type { BadgeTone } from "@/components/ui/Badge";
import type {
  FbPost,
  FbPostStatus,
  FbPlanStatus,
  FbComponentStatus,
  FbPillar,
  FbTarget,
  FbArchetype,
  FbMediaType,
  FbReasonCode,
} from "@/lib/supabase/types";

/**
 * Calendar status colours (shared legend).
 * Status progression (Mark's spec): approved = yellow (queued, waiting) →
 * published to Facebook = green (emerald). 'posted' means BOTH legs done for
 * target='both'; the page-leg-only state is derived via postPublishMeta.
 */
export const FB_STATUS_META: Record<FbPostStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "navy" },
  approved: { label: "Approved", tone: "amber" },
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

/** Post media type badge (0011/0014). Shown on a post when media_type='video' or 'text'. */
export const MEDIA_TYPE_META: Record<FbMediaType, { label: string; tone: BadgeTone }> = {
  image: { label: "Image", tone: "slate" },
  video: { label: "Video", tone: "sky" },
  text: { label: "Text only", tone: "amber" },
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

/**
 * Rejection reason codes — component-specific so the dropdown is always
 * relevant to what's being rejected. The union of the lists matches the
 * fb_post_feedback CHECK constraint (widened in db/migrations/0011). The
 * chosen code + note flow into WF3's regeneration prompt as feedback, so a
 * specific reason directly improves the regenerated copy, image, or video.
 */
export const COPY_REASON_CODES: { value: FbReasonCode; label: string }[] = [
  { value: "weak-hook", label: "Weak hook — wouldn't stop the scroll" },
  { value: "off-brand", label: "Off-brand — doesn't sound like us" },
  { value: "inaccurate", label: "Inaccurate — factual or product error" },
  { value: "canon-violation", label: "Canon violation — timeline, names, or claims" },
  { value: "compliance-risk", label: "Compliance risk — insurance, scarcity, or pricing" },
  { value: "too-salesy", label: "Too salesy — pitches instead of teaching" },
  { value: "wrong-pillar-fit", label: "Wrong fit — misses the pillar or archetype" },
  { value: "weak-cta", label: "Weak CTA — ask or first comment is off" },
  { value: "other", label: "Other (describe below)" },
];

export const IMAGE_REASON_CODES: { value: FbReasonCode; label: string }[] = [
  { value: "image-mismatch", label: "Doesn't match the copy — wrong subject or story" },
  { value: "wrong-scene", label: "Wrong scene — setting or subject is off-concept" },
  { value: "looks-ai", label: "Looks AI / cartoonish — not photoreal" },
  { value: "wrong-mood", label: "Wrong mood — lighting or tone misses the message" },
  { value: "bad-composition", label: "Bad composition — framing, crop, or focal point" },
  { value: "image-artifacts", label: "Artifacts — warped details, glitches, or text in image" },
  { value: "image-quality", label: "Low quality — blurry, dull, or flat" },
  { value: "other", label: "Other (describe below)" },
];

export const VIDEO_REASON_CODES: { value: FbReasonCode; label: string }[] = [
  { value: "motion-unnatural", label: "Unnatural motion — jittery, morphing, or off" },
  { value: "video-quality", label: "Low quality — artifacts, blur, or bad render" },
  { value: "off-brand", label: "Off-brand — doesn't look or sound like us" },
  { value: "compliance-risk", label: "Compliance risk — claim, scarcity, or pricing" },
  { value: "other", label: "Other (describe below)" },
];

/** Union list (back-compat for non-component contexts). */
export const REASON_CODES: { value: FbReasonCode; label: string }[] = [
  ...COPY_REASON_CODES.filter((r) => r.value !== "other"),
  ...IMAGE_REASON_CODES.filter((r) => r.value !== "other"),
  ...VIDEO_REASON_CODES,
];

/** Short labels for chart axes and compact UI (covers every code). */
export const REASON_LABEL: Record<FbReasonCode, string> = {
  "weak-hook": "Weak hook",
  "off-brand": "Off-brand",
  inaccurate: "Inaccurate",
  "canon-violation": "Canon violation",
  "compliance-risk": "Compliance risk",
  "too-salesy": "Too salesy",
  "wrong-pillar-fit": "Wrong pillar fit",
  "weak-cta": "Weak CTA",
  "image-mismatch": "Image mismatch",
  "wrong-scene": "Wrong scene",
  "looks-ai": "Looks AI",
  "wrong-mood": "Wrong mood",
  "bad-composition": "Bad composition",
  "image-artifacts": "Artifacts",
  "image-quality": "Image quality",
  "motion-unnatural": "Unnatural motion",
  "video-quality": "Video quality",
  other: "Other",
};

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
