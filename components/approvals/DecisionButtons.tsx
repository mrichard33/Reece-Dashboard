"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { castDecision } from "@/lib/actions/approvals";

export function DecisionButtons({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await castDecision(assetId, "approved", "");
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  function submitReject() {
    if (!reason.trim()) {
      setError("A reason is required to request changes.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await castDecision(assetId, "rejected", reason);
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        setRejecting(false);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          onClick={approve}
          disabled={pending}
          variant="primary"
          className="w-full justify-center sm:w-auto"
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button
          onClick={() => setRejecting((v) => !v)}
          disabled={pending}
          variant="danger"
          className="w-full justify-center sm:w-auto"
        >
          <X className="h-4 w-4" /> Request changes
        </Button>
      </div>

      {rejecting && (
        <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
          <label className="block text-xs font-medium text-rose-800 dark:text-rose-200">
            Reason (required)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder="What needs to change?"
          />
          <Button onClick={submitReject} disabled={pending} variant="danger" size="sm">
            Submit changes request
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
