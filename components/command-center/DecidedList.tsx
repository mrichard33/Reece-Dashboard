"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoPopover } from "@/components/help/InfoPopover";
import { rule } from "@/lib/actions/commandCenter";
import { errorMessageFor, STAGE_LABEL, type RolloutStage, type RuleErrorCode } from "@/lib/commandCenter/rules";
import { ReasonDialog } from "./ReasonDialog";
import type { DecidedRow } from "@/lib/queries/commandCenter";

const stageTone: Record<string, BadgeTone> = {
  decided: "slate", built: "sky", verified: "emerald", no_build: "slate",
};

/**
 * The Decided tab: what has been ruled, and the way back.
 *
 * Flip is the point of this screen. Nothing is ever erased — a flip restores the
 * exact values the ruling changed and files the reversal as its own row — so
 * changing your mind is a normal thing to do rather than a data-recovery job.
 * A flip of a BUILT or VERIFIED decision is different, and says so: the record
 * can be put back, but the thing that was built is still built, so the flip
 * files a ROLL BACK to-do.
 */
export function DecidedList({ rows, canRule }: { rows: DecidedRow[]; canRule: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        Nothing ruled yet. Rulings you make show up here, with a way back.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <DecidedItem key={r.id} row={r} canRule={canRule} />
      ))}
    </div>
  );
}

function DecidedItem({ row, canRule }: { row: DecidedRow; canRule: boolean }) {
  const router = useRouter();
  const [flipOpen, setFlipOpen] = useState(false);
  const [confirmBuilt, setConfirmBuilt] = useState(false);
  const [proofFor, setProofFor] = useState<RolloutStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reversed = row.reversed_by != null;
  const isFlip = row.action === "flip";
  const builtOrVerified = row.rollout_stage === "built" || row.rollout_stage === "verified";

  function send(input: Parameters<typeof rule>[0]) {
    setError(null);
    startTransition(async () => {
      const res = await rule(input);
      if (res.ok) {
        setFlipOpen(false); setConfirmBuilt(false); setProofFor(null);
        router.refresh();
        return;
      }
      const { text, reload } = errorMessageFor(res.code as RuleErrorCode, res.message ?? res.error);
      setError(text);
      if (reload) setTimeout(() => router.refresh(), 1200);
    });
  }

  function setStage(stage: RolloutStage) {
    if (row.decision_id == null) return;
    if (stage === "verified") { setProofFor("verified"); return; }
    send({ action: "stage", target: { table: "claude_decision_log", id: row.decision_id }, stage: stage as "built" | "no_build" });
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{new Date(row.at).toLocaleString()}</span>
          <Badge tone={isFlip ? "amber" : "navy"}>{row.action}</Badge>
          {row.rollout_stage ? (
            <Badge tone={stageTone[row.rollout_stage] ?? "slate"}>
              {STAGE_LABEL[row.rollout_stage as RolloutStage] ?? row.rollout_stage}
            </Badge>
          ) : null}
          {row.via === "chat" ? <Badge tone="slate">from chat</Badge> : null}
          {reversed ? <Badge tone="rose">Flipped by #{row.reversed_by}</Badge> : null}
          {row.flip_count > 0 ? <span>ruled {row.flip_count + 1}×</span> : null}
          <span className="ml-auto">{row.ruled_by}</span>
        </div>

        {row.card_title ? (
          <p className="text-sm font-medium text-navy-900 dark:text-slate-100">{row.card_title}</p>
        ) : null}
        {row.decision_text ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">{row.decision_text}</p>
        ) : null}
        {row.reason ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Because: {row.reason}</p>
        ) : null}

        {canRule ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!reversed && !isFlip ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => (builtOrVerified ? setConfirmBuilt(true) : setFlipOpen(true))}
              >
                <Undo2 className="h-3 w-3" aria-hidden /> Flip
              </Button>
            ) : null}
            {!reversed && !isFlip ? <InfoPopover helpKey="commandCenter.flip" /> : null}
            {row.decision_id != null ? (
              <>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStage("built")}>Built</Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStage("verified")}>Verified</Button>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStage("no_build")}>No build needed</Button>
                <InfoPopover helpKey="commandCenter.stage" />
              </>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </CardContent>

      {/* Flipping something already built needs eyes open first. */}
      {confirmBuilt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={() => setConfirmBuilt(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900 dark:text-slate-100">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
              This one was already {row.rollout_stage}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The record goes back exactly. The thing that was built does not — so
              flipping this files a <strong>ROLL BACK</strong> to-do for the undo work.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmBuilt(false)}>Cancel</Button>
              <Button onClick={() => { setConfirmBuilt(false); setFlipOpen(true); }}>Continue</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ReasonDialog
        open={flipOpen}
        pending={pending}
        title={`Flip ruling #${row.id}`}
        prompt="Nothing is erased. The old state comes back and this flip is recorded as its own row."
        onCancel={() => setFlipOpen(false)}
        onConfirm={(reason) => send({ action: "flip", reverses_id: row.id, reason })}
      />

      <ProofDialog
        open={proofFor === "verified"}
        pending={pending}
        onCancel={() => setProofFor(null)}
        onConfirm={(proof) =>
          row.decision_id != null &&
          send({ action: "stage", target: { table: "claude_decision_log", id: row.decision_id }, stage: "verified", proof })
        }
      />
    </Card>
  );
}

/** Verified is a claim about the real world, so it has to name what proved it. */
function ProofDialog({
  open, pending, onCancel, onConfirm,
}: {
  open: boolean; pending?: boolean; onCancel: () => void; onConfirm: (proof: string) => void;
}) {
  const [proof, setProof] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-navy-900 dark:text-slate-100">What proved it?</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          A PR, a query you ran, a screen you looked at — one line.
        </p>
        <input
          autoFocus
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button disabled={pending || !proof.trim()} onClick={() => onConfirm(proof.trim())}>
            Mark verified
          </Button>
        </div>
      </div>
    </div>
  );
}
