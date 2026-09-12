"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Mic, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoPopover } from "@/components/help/InfoPopover";
import { rule, recheck } from "@/lib/actions/commandCenter";
import {
  buttonsFor, suggestedButton, needsReason, verdictFor, prefillDecisionText,
  stripOmiPrefix, isOmi, errorMessageFor,
  CARD_TYPE_LABEL, RISK_LABEL, CONFIDENCE_LABEL,
  type QueueCard, type CardButton, type RuleAction, type RuleErrorCode,
} from "@/lib/commandCenter/rules";
import { ReasonDialog } from "./ReasonDialog";
import { ApproveDialog, type ApproveResult } from "./ApproveDialog";
import { SnoozeDialog } from "./SnoozeDialog";
import { GuardDialog, type GuardMatch } from "./GuardDialog";

/** What is waiting on the person: the dialog currently open, if any. */
type Stage =
  | { kind: "idle" }
  | { kind: "approve"; action: RuleAction; optionKey?: string }
  | { kind: "option" }
  | { kind: "snooze" }
  | { kind: "reason"; action: RuleAction; payload: Partial<Payload> }
  | { kind: "guard"; match: GuardMatch; payload: Ruling };

type Payload = {
  action: RuleAction;
  text: string;
  category: string;
  option_key: string;
  reason: string;
  build: { description: string };
  snooze_until: string;
  /** Set only when the guard dialog has been answered. */
  supersedes_id: number;
  same_as_id: number;
};

/** A ruling ready to send: whatever has been collected, plus the action. */
type Ruling = Partial<Payload> & { action: RuleAction };

const riskTone: Record<string, BadgeTone> = {
  money: "rose", live_leads: "rose", customer_messaging: "amber",
};
const confidenceTone: Record<string, BadgeTone> = {
  high: "emerald", medium: "amber", low: "slate", no_evidence: "slate",
};

/**
 * One card in the Rulings queue.
 *
 * The shape of it follows how a ruling actually gets made: what is being asked,
 * what the record says about it, and then the buttons. The recommendation sits
 * ABOVE the buttons and below the question on purpose — it is meant to be read,
 * not obeyed, and overriding it costs one sentence rather than a fight.
 *
 * Every button collects only what memory_rule will demand: a reason when the
 * ruling is a rejection, a flip, or an override; the exact wording when the
 * wording matters. Anything else goes straight through.
 */
export function RulingCard({ card, canRule }: { card: QueueCard; canRule: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const buttons = buttonsFor(card);
  const suggested = suggestedButton(card);
  const omi = isOmi(card);
  const body = stripOmiPrefix(card.description);

  /** Send a ruling. Handles the two answers that are questions, not failures. */
  function send(payload: Ruling) {
    setError(null);
    startTransition(async () => {
      const res = await rule({
        action: payload.action,
        target: { table: card.source_table, id: card.source_id },
        card_version: card.card_version,
        text: payload.text,
        category: payload.category,
        option_key: payload.option_key,
        reason: payload.reason,
        build: payload.build,
        snooze_until: payload.snooze_until,
        supersedes_id: payload.supersedes_id,
        same_as_id: payload.same_as_id,
      });

      if (res.ok) {
        setStage({ kind: "idle" });
        setDone("Saved.");
        router.refresh();
        return;
      }
      // The guard is a question — ask it rather than reporting a failure.
      if (res.code === "guard_conflict" && res.match) {
        setStage({ kind: "guard", match: res.match, payload });
        return;
      }
      const { text, reload } = errorMessageFor(res.code as RuleErrorCode, res.message ?? res.error);
      setError(text);
      setStage({ kind: "idle" });
      if (reload) setTimeout(() => router.refresh(), 1200);
    });
  }

  /** A click: open the dialog the button needs, or send straight through. */
  function click(b: CardButton, optionKey?: string) {
    if (b.opens === "snooze") { setStage({ kind: "snooze" }); return; }
    if (b.opens === "option") { setStage({ kind: "option" }); return; }
    if (b.opens === "approve") { setStage({ kind: "approve", action: b.action, optionKey }); return; }

    // Approve files the recommendation as it stands, so everything the dialog
    // would have collected has to travel with it. Without the text the server
    // falls back to the card's description — the question, not the answer — and
    // without the category every decision lands under "operations".
    const filled: Partial<Payload> = b.fillsFromRecommendation
      ? {
          text: prefillDecisionText(card),
          category: card.rec_category ?? undefined,
          build: card.rec_build_text ? { description: card.rec_build_text } : undefined,
        }
      : {};

    if (needsReason(b.action, card.rec_verdict, optionKey)) {
      setStage({ kind: "reason", action: b.action, payload: { ...filled, option_key: optionKey } });
      return;
    }
    send({ action: b.action, ...filled, option_key: optionKey });
  }

  /**
   * What the reason box should say. A rejection always needs a line even when
   * the recommendation agreed with it, so saying "this goes a different way"
   * there would simply be wrong.
   */
  function reasonPrompt(action: RuleAction, optionKey?: string | null): string {
    const v = verdictFor(action, optionKey);
    if (card.rec_verdict && v !== null && v !== card.rec_verdict) {
      return `The recommendation was "${card.rec_verdict}". This goes a different way.`;
    }
    if (action === "reject" || action === "no") {
      return "A rejection always needs one line on the record — even when the AI suggested it too.";
    }
    return "This one needs a reason on the record.";
  }

  /** After the Approve dialog: a reason may still be owed on top of the wording. */
  function afterApprove(action: RuleAction, r: ApproveResult, optionKey?: string) {
    const payload: Partial<Payload> = {
      text: r.text, category: r.category, build: r.build, option_key: optionKey,
    };
    if (needsReason(action, card.rec_verdict, optionKey)) {
      setStage({ kind: "reason", action, payload });
      return;
    }
    send({ action, ...payload });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {/* ── what kind of thing this is ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-0.5">
            <Badge tone={card.card_type === "conflict" ? "rose" : "navy"}>
              {CARD_TYPE_LABEL[card.card_type]}
            </Badge>
            {card.card_type === "conflict" ? (
              <InfoPopover helpKey="commandCenter.conflictCard" />
            ) : null}
          </span>
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
          {card.blocks_count > 0 ? (
            <Badge tone="amber">Blocking {card.blocks_count}</Badge>
          ) : null}
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            {card.age_days == null ? "" : `${card.age_days}d old`}
          </span>
        </div>

        {/* ── the question ───────────────────────────────────────────── */}
        {card.card_type === "conflict" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Side label="Left" id={card.left_id} text={card.left_text} origin={card.left_origin}
              confidence={card.left_confidence} date={card.left_date} stage={card.left_rollout_stage} />
            <Side label="Right" id={card.right_id} text={card.right_text} origin={card.right_origin}
              confidence={card.right_confidence} date={card.right_date} stage={card.right_rollout_stage} />
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-navy-900 dark:text-slate-100">{body}</p>
        )}

        {card.options && card.options.length > 0 && card.card_type !== "conflict" ? (
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {card.options.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-slate-400">{i + 1}.</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* ── what the record says ───────────────────────────────────── */}
        <Recommendation card={card} />

        {/* ── the buttons ────────────────────────────────────────────── */}
        {canRule ? (
          <div className="flex flex-wrap items-end gap-2">
            {buttons.map((b) => (
              <span key={b.id} className="inline-flex flex-col items-center gap-0.5">
                <Button
                  variant={b.tone}
                  size="sm"
                  disabled={pending}
                  onClick={() => click(b)}
                  className={
                    b.id === suggested
                      ? "ring-2 ring-navy-600 ring-offset-1 dark:ring-slate-300 dark:ring-offset-slate-900"
                      : undefined
                  }
                >
                  {b.label}
                </Button>
                {/* Named as well as ringed: a ring alone is invisible to anyone
                    who cannot pick it out against the button's own colour. */}
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
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await recheck(card.source_table, card.source_id);
                  if (!res.ok) setError(errorMessageFor(res.code as RuleErrorCode, res.message).text);
                  else router.refresh();
                })
              }
              className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <RefreshCw className="h-3 w-3" aria-hidden /> Re-check
            </button>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="h-3 w-3" aria-hidden /> Read-only — ruling is admin only.
          </p>
        )}

        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{done}</p>
        ) : null}
      </CardContent>

      {/* ── dialogs ──────────────────────────────────────────────────── */}
      {stage.kind === "approve" ? (
        <ApproveDialog
          card={card}
          pending={pending}
          title={stage.action === "new_answer" ? "Write a new answer" : "Save this decision"}
          onCancel={() => setStage({ kind: "idle" })}
          onConfirm={(r) => afterApprove(stage.action, r, stage.optionKey)}
        />
      ) : null}

      <OptionDialog
        open={stage.kind === "option"}
        options={card.options ?? []}
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onPick={(index, text) => {
          const key = String(index);
          if (needsReason("pick_option", card.rec_verdict, key)) {
            setStage({ kind: "reason", action: "pick_option", payload: { option_key: key, text } });
            return;
          }
          send({ action: "pick_option", option_key: key, text });
        }}
      />

      <SnoozeDialog
        open={stage.kind === "snooze"}
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onConfirm={(until) => send({ action: "snooze", snooze_until: until })}
      />

      <ReasonDialog
        open={stage.kind === "reason"}
        pending={pending}
        title="Say why"
        prompt={
          stage.kind === "reason"
            ? reasonPrompt(stage.action, stage.payload.option_key)
            : ""
        }
        onCancel={() => setStage({ kind: "idle" })}
        onConfirm={(reason) => {
          if (stage.kind !== "reason") return;
          send({ action: stage.action, ...stage.payload, reason });
        }}
      />

      <GuardDialog
        open={stage.kind === "guard"}
        match={stage.kind === "guard" ? stage.match : null}
        pending={pending}
        onCancel={() => setStage({ kind: "idle" })}
        onReplace={(id) => {
          if (stage.kind !== "guard") return;
          send({ ...stage.payload, supersedes_id: id });
        }}
        onSame={(id) => {
          if (stage.kind !== "guard") return;
          send({ ...stage.payload, same_as_id: id });
        }}
      />
    </Card>
  );
}

/** One side of a conflict, with the provenance that decides which one wins. */
function Side({
  label, id, text, origin, confidence, date, stage,
}: {
  label: string; id: number | null; text: string | null; origin: string | null;
  confidence: string | null; date: string | null; stage: string | null;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium uppercase tracking-wide">{label}</span>
        {id != null ? <span>#{id}</span> : null}
        {origin ? <Badge tone={origin === "live" ? "emerald" : "slate"}>{origin}</Badge> : null}
        {confidence ? <Badge tone={confidence === "confirmed" ? "emerald" : "amber"}>{confidence}</Badge> : null}
        {date ? <span>{date}</span> : null}
        {stage ? <Badge tone="navy">{stage}</Badge> : null}
      </div>
      <p className="whitespace-pre-wrap text-sm text-navy-900 dark:text-slate-100">{text ?? "—"}</p>
    </div>
  );
}

/**
 * The recommendation block. Absent until the nightly has reached this card,
 * and it says so rather than showing an empty frame — a card with no
 * recommendation is still perfectly rulable.
 */
function Recommendation({ card }: { card: QueueCard }) {
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
        <Badge tone="navy">{card.rec_verdict}</Badge>
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

/** Pick one of the options the card already carries. */
function OptionDialog({
  open, options, pending, onCancel, onPick,
}: {
  open: boolean; options: string[]; pending?: boolean;
  onCancel: () => void; onPick: (index: number, text: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-navy-900 dark:text-slate-100">Pick one</h3>
        <ul className="mt-3 space-y-2">
          {options.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(i, o)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-left text-sm text-navy-900 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
