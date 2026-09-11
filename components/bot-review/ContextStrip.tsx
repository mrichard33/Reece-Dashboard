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
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      {/* Who this actually is. First line, because a reviewer who finds a bad
          reply has to be able to look this person up in LeadPerfection or GHL —
          and because a market label made four messages to the SAME contact look
          like four different leads. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-display text-sm font-semibold text-navy-900 dark:text-white">
            {row.contact_name?.trim() || "Unnamed lead"}
          </span>
          {(row.contact_city || row.office) && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {row.contact_city || row.office}
            </span>
          )}
          {row.rep_name && (
            <span className="text-xs text-slate-500 dark:text-slate-400">· Rep {row.rep_name}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {row.lp_prospect_id && <IdChip label="Prospect" value={row.lp_prospect_id} />}
          {row.lp_lead_id && <IdChip label="LP lead" value={row.lp_lead_id} />}
          {row.ghl_contact_id && <IdChip label="GHL" value={row.ghl_contact_id} />}
        </div>
      </div>

      {(row.contact_phone || row.contact_email) && (
        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-slate-400">
          {row.contact_phone && <span className="font-mono">{formatPhone(row.contact_phone)}</span>}
          {row.contact_email && <span className="truncate">{row.contact_email}</span>}
        </div>
      )}

      {/* Everything above the line is the conversation; everything below it is
          the one message being scored. Saying so matters now that the thread
          holds several messages to the same lead. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          This message
        </span>
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
    </div>
  );
}

/**
 * One copyable id. The value is monospace because these get pasted into
 * LeadPerfection and GHL search boxes, where a transcription slip costs more
 * time than the lookup saves.
 */
function IdChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${label}: ${value}`}>
      <span className="font-sans text-slate-400 dark:text-slate-500">{label}</span>
      <span className="select-all text-slate-700 dark:text-slate-200">{value}</span>
    </span>
  );
}

/** US 10-digit numbers read as (407) 376-3631; anything else is left alone. */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}
