"use client";

/**
 * The parts every Command Center card shares, in one place.
 *
 * Release 1 had one lane, so the frame and the Rulings card were the same file.
 * Release 2 adds two more lanes that differ ONLY in their body and their
 * buttons — the badge row, the recommendation block, the "AI suggests" marker,
 * the read-only line and the settled state are identical, and must stay
 * identical. Copying RulingCard.tsx to make a second card would have produced
 * two badge rows that drift apart the first time one of them is touched.
 *
 * So these are moved out of RulingCard.tsx rather than duplicated from it:
 * RulingCard imports them, LaneCard imports them, and there is one definition
 * of what a card looks like.
 */

import { Mic, Lock, Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoPopover } from "@/components/help/InfoPopover";
import {
  isOmi, CARD_TYPE_LABEL, RISK_LABEL, CONFIDENCE_LABEL,
  type QueueCard, type CardButton, type ButtonId,
} from "@/lib/commandCenter/rules";

export const riskTone: Record<string, BadgeTone> = {
  money: "rose",
  live_leads: "rose",
  customer_messaging: "amber",
};

export const confidenceTone: Record<string, BadgeTone> = {
  high: "emerald",
  medium: "amber",
  low: "slate",
  no_evidence: "slate",
};

/** What kind of thing this is, plus everything that changes how urgent it looks. */
export function CardBadges({ card }: { card: QueueCard }) {
  const omi = isOmi(card);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-0.5">
        <Badge tone={card.card_type === "conflict" ? "rose" : "navy"}>
          {CARD_TYPE_LABEL[card.card_type]}
        </Badge>
        {card.card_type === "conflict" ? <InfoPopover helpKey="commandCenter.conflictCard" /> : null}
        {card.card_type === "stale_issue" ? <InfoPopover helpKey="commandCenter.staleLane" /> : null}
        {card.card_type === "todo" ? <InfoPopover helpKey="commandCenter.todoLane" /> : null}
      </span>
      {/* The to-do lane's ~150 raw item_type values, shown as one of four names.
          The stored value is untouched — this is the display half of
          claude_item_type_norm. */}
      {card.card_type === "todo" && card.item_type_norm ? (
        <Badge tone="slate">{card.item_type_norm.replace(/_/g, " ")}</Badge>
      ) : null}
      {card.area ? <Badge tone="slate">{card.area}</Badge> : null}
      {card.rec_risk && card.rec_risk !== "none" ? (
        <span className="inline-flex items-center gap-0.5">
          <Badge tone={riskTone[card.rec_risk] ?? "amber"}>{RISK_LABEL[card.rec_risk]}</Badge>
          <InfoPopover helpKey="commandCenter.riskBadge" />
        </span>
      ) : null}
      {omi ? (
        <span className="inline-flex items-center gap-0.5">
          <Badge tone="sky">
            <Mic className="h-3 w-3" aria-hidden /> Heard on Omi
          </Badge>
          <InfoPopover helpKey="commandCenter.omiBadge" />
        </span>
      ) : null}
      {/* This to-do is already a task in Mark's Omi, so ticking it off here is
          not the only place it lives. */}
      {card.omi_action_item_id ? (
        <span className="inline-flex items-center gap-0.5">
          <Badge tone="slate">In Omi</Badge>
          <InfoPopover helpKey="commandCenter.inOmiBadge" />
        </span>
      ) : null}
      {card.blocks_count > 0 ? <Badge tone="amber">Blocking {card.blocks_count}</Badge> : null}
      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
        {card.age_days == null ? "" : `${card.age_days}d old`}
      </span>
    </div>
  );
}

/** What the record says, and how sure it is. Never a ruling — a suggestion. */
export function Recommendation({ card }: { card: QueueCard }) {
  if (!card.rec_at || !card.rec_verdict) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        No recommendation yet — rule it on what you know, or hit Re-check.
      </p>
    );
  }
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Suggested
        </span>
        <InfoPopover helpKey="commandCenter.recommendation" />
        <Badge tone="navy">{card.rec_verdict.replace(/_/g, " ")}</Badge>
        {card.rec_confidence ? (
          <Badge tone={confidenceTone[card.rec_confidence] ?? "slate"}>
            {CONFIDENCE_LABEL[card.rec_confidence]}
          </Badge>
        ) : null}
      </div>
      {card.rec_reason ? (
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{card.rec_reason}</p>
      ) : null}
      {card.rec_evidence && card.rec_evidence.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          {card.rec_evidence.map((e, i) => (
            <li key={i}>
              <span className="font-medium">{e.type} {e.ref}</span>
              {e.note ? <> — {e.note}</> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The buttons, with the recommendation marked on whichever one matches.
 *
 * The marker is NAMED as well as ringed: a ring on its own is invisible to
 * anyone who cannot pick it out against the button's own colour. The caption
 * keeps its space when hidden so the row does not jump as cards render.
 */
export function ButtonRow({
  buttons, suggested, pending, busy, onClick, trailing,
}: {
  buttons: CardButton[];
  suggested: ButtonId | null;
  pending: boolean;
  busy: (key: string) => boolean;
  onClick: (b: CardButton) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {buttons.map((b) => (
        <span key={b.id} className="inline-flex flex-col items-center gap-0.5">
          <Button
            variant={b.tone}
            size="sm"
            disabled={pending}
            onClick={() => onClick(b)}
            className={
              b.id === suggested
                ? "ring-2 ring-navy-600 ring-offset-1 dark:ring-slate-300 dark:ring-offset-slate-900"
                : undefined
            }
          >
            {busy(b.id) ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
            {b.label}
          </Button>
          <span
            className={
              b.id === suggested
                ? "text-[10px] font-medium uppercase tracking-wide text-navy-700 dark:text-slate-300"
                : "invisible text-[10px] uppercase tracking-wide"
            }
            aria-hidden={b.id !== suggested}
          >
            AI suggests
          </span>
        </span>
      ))}
      {trailing}
    </div>
  );
}

/** Hiding the buttons is a courtesy; the server action is the actual gate. */
export function ReadOnlyNote({ what = "ruling" }: { what?: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <Lock className="h-3 w-3" aria-hidden /> Read-only — {what} is admin only.
    </p>
  );
}

/**
 * A ruled card collapses to one line rather than disappearing, so the list does
 * not jump under the next click, and rather than re-rendering the whole page,
 * which is what made a pass feel slow.
 */
export function SettledCard({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-2 px-5 py-3">
        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      </CardContent>
    </Card>
  );
}
