import Link from "next/link";
import {
  FileText,
  Music,
  Video,
  Layers,
  ScrollText,
  Settings,
  File,
  Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ApproverMatrix } from "./ApproverMatrix";
import { STATUS_META, ASSET_TYPE_LABEL } from "./meta";
import { relTime } from "@/lib/utils";
import type { AssetType } from "@/lib/supabase/types";
import type { AssetListItem } from "@/lib/queries/approvals";

const TYPE_ICON: Record<AssetType, React.ComponentType<{ className?: string }>> = {
  script: ScrollText,
  audio: Music,
  video: Video,
  framework: Layers,
  transcript: FileText,
  system_change: Settings,
  other: File,
};

export function AssetCard({
  asset,
  myExecId,
}: {
  asset: AssetListItem;
  myExecId: string;
}) {
  const status = STATUS_META[asset.status];
  const Icon = TYPE_ICON[asset.asset_type];
  const needsMe =
    asset.status === "in_review" &&
    asset.approvals.some(
      (a) => a.executive_id === myExecId && a.required && a.decision === "pending",
    );

  return (
    <Link
      href={`/approvals/${asset.id}`}
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-navy-300 hover:shadow dark:border-slate-800 dark:bg-slate-900 dark:hover:border-navy-600"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 rounded-md bg-slate-100 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900 dark:text-slate-100">
              {asset.title}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {ASSET_TYPE_LABEL[asset.asset_type]} · updated {relTime(asset.updated_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
          {needsMe && <Badge tone="brick">Your sign-off</Badge>}
        </div>
      </div>

      {asset.description && (
        <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
          {asset.description}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <ApproverMatrix approvals={asset.approvals} />
        {asset.attachments.length > 0 && (
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-slate-400">
            <Paperclip className="h-3 w-3" />
            {asset.attachments.length}
          </span>
        )}
      </div>
    </Link>
  );
}
