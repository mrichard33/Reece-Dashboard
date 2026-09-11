"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { scoreTone } from "@/lib/botReview/core";
import type { QueueRow } from "@/lib/queries/botReview";

/**
 * The chips above the thread: what shaped this message and what it led to.
 *
 * "Used N learned items" is the transparency hook — in Phase 1 the arrays are
 * always empty, so it reads "Used 0 learned items" and the popover says why.
 * It ships now rather than in Phase 2 because the fingerprint already carries
 * the columns, and a reviewer who sees the row from day one is not surprised
 * by it later.
 */

function outcomeLabel(r: QueueRow): { label: string; tone: "emerald" | "rose" | "slate" } {
  if (r.opted_out_at) return { label: "Opted out", tone: "rose" };
  if (r.booked_at) return { label: "Booked", tone: "emerald" };
  if (r.replied_at) return { label: "Replied", tone: "emerald" };
  if (!r.sent_at) return { label: "Not sent", tone: "slate" };
  const hours = Math.floor((Date.now() - new Date(r.sent_at).getTime()) / 3_600_000);
  return { label: `No reply · ${hours}h`, tone: "slate" };
}

export function ContextStrip({
  row,
  canStopBot,
  onStopBot,
}: {
  row: QueueRow;
  canStopBot: boolean;
  onStopBot: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [learnedOpen, setLearnedOpen] = useState(false);
  const outcome = outcomeLabel(row);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="navy">
          <span className="font-mono text-[11px]">{row.rule_applied ?? row.workflow_code ?? "no rule"}</span>
        </Badge>
        {row.buyer_stage != null && <Badge tone="slate">Buyer stage {row.buyer_stage}</Badge>}
        {row.intent_class && <Badge tone="slate">{row.intent_class}</Badge>}
        <span className="inline-flex items-center gap-1">
          <Badge tone={scoreTone(row.ai_score)}>
            AI score {row.ai_score == null ? "—" : Math.round(row.ai_score)}
          </Badge>
          <InfoPopover helpKey="botReview.aiScore" />
        </span>
        <Badge tone={outcome.tone}>{outcome.label}</Badge>

        <div className="relative">
          <button
            type="button"
            onClick={() => setLearnedOpen((v) => !v)}
            className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200 hover:ring-sky-400 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900"
          >
            Used {row.learned_items_count} learned item{row.learned_items_count === 1 ? "" : "s"}
          </button>
          {learnedOpen && (
            <div className="absolute left-0 top-7 z-20 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="font-semibold text-navy-900 dark:text-white">What shaped this message</p>
              {row.learned_items_count === 0 ? (
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  Nothing yet. Approved instructions and examples start reaching the bot in Phase 2 — until
                  then every reply comes from the base prompt and the knowledge base alone.
                </p>
              ) : (
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {row.learned_items_count} approved item{row.learned_items_count === 1 ? "" : "s"} were injected
                  into this message.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {row.ghl_contact_id && (
          <a
            href={`https://app.gohighlevel.com/v2/location/contacts/detail/${row.ghl_contact_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
          >
            Open in GHL <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {canStopBot && (
          <div className="relative">
            <button
              type="button"
              aria-label="Lead actions"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onStopBot();
                  }}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-rose-700 hover:bg-rose-50",
                    "dark:text-rose-300 dark:hover:bg-rose-950",
                  )}
                >
                  Stop the bot for this lead
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
