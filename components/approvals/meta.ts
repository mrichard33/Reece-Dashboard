import type { AssetStatus, AssetType, ActivityCategory } from "@/lib/supabase/types";
import type { BadgeTone } from "@/components/ui/Badge";

export const STATUS_META: Record<AssetStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "slate" },
  in_review: { label: "In Review", tone: "amber" },
  approved: { label: "Approved", tone: "emerald" },
  changes_requested: { label: "Changes Requested", tone: "rose" },
};

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  script: "Script",
  audio: "Audio",
  video: "Video",
  framework: "Framework",
  transcript: "Transcript",
  system_change: "System Change",
  other: "Other",
};

export const CATEGORY_META: Record<ActivityCategory, { label: string; tone: BadgeTone }> = {
  content: { label: "Content", tone: "navy" },
  automation: { label: "Automation", tone: "sky" },
  funnel: { label: "Funnel", tone: "brick" },
  other: { label: "Other", tone: "slate" },
};
