"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { submitAsset } from "@/lib/actions/approvals";
import type { AssetStatus } from "@/lib/supabase/types";

export function AdminAssetActions({
  assetId,
  status,
}: {
  assetId: string;
  status: AssetStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await submitAsset(assetId);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/approvals/${assetId}/edit`}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-navy-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Link>
      {status === "draft" && (
        <Button onClick={submit} disabled={pending}>
          <Send className="h-3.5 w-3.5" /> Submit for review
        </Button>
      )}
    </div>
  );
}
