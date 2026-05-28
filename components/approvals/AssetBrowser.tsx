"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { AssetCard } from "./AssetCard";
import { STATUS_META } from "./meta";
import type { AssetStatus } from "@/lib/supabase/types";
import type { AssetListItem } from "@/lib/queries/approvals";

type Tab = "needs" | "all";
type StatusFilter = AssetStatus | "all";

export function AssetBrowser({
  assets,
  myExecId,
  isAdmin,
}: {
  assets: AssetListItem[];
  myExecId: string;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("needs");
  const [status, setStatus] = useState<StatusFilter>("all");

  const needsAction = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.status === "in_review" &&
          a.approvals.some(
            (ap) =>
              ap.executive_id === myExecId && ap.required && ap.decision === "pending",
          ),
      ),
    [assets, myExecId],
  );

  const allFiltered = useMemo(
    () => (status === "all" ? assets : assets.filter((a) => a.status === status)),
    [assets, status],
  );

  const statuses: StatusFilter[] = isAdmin
    ? ["all", "draft", "in_review", "approved", "changes_requested"]
    : ["all", "in_review", "approved", "changes_requested"];

  const list = tab === "needs" ? needsAction : allFiltered;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={tab === "needs"} onClick={() => setTab("needs")}>
          Needs action
          {needsAction.length > 0 && (
            <span className="ml-1.5 rounded-full bg-brick px-1.5 text-[10px] font-semibold text-white">
              {needsAction.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>
          All assets
        </TabButton>
      </div>

      {tab === "all" && (
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition",
                status === s
                  ? "bg-navy-800 text-white ring-navy-800 dark:bg-navy-600 dark:ring-navy-600"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700",
              )}
            >
              {s === "all" ? "All" : STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {tab === "needs" ? "Nothing is waiting on you. " : "No assets here yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <AssetCard key={a.id} asset={a} myExecId={myExecId} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
        active
          ? "border-navy-700 text-navy-900 dark:border-navy-400 dark:text-white"
          : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
      )}
    >
      {children}
    </button>
  );
}
