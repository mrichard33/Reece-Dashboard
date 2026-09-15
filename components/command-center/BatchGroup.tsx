"use client";

/**
 * A group of cards that share one reason, ruled in one pass.
 *
 * This is the component that makes 3,024 cards tractable, and it is also the
 * one that could do the most damage, so it is built to be read before it is
 * clicked:
 *
 *   - every card is LISTED, not summarised. A count with a button is a
 *     gambling machine; a list with checkboxes is a decision.
 *   - every box starts CHECKED, because the group exists precisely because the
 *     recommendation says they belong together — but unchecking is one click,
 *     and the count on the button follows what is actually checked.
 *   - the button says what will happen to how many, and when it is disabled it
 *     says why in a sentence rather than just greying out.
 *
 * Nothing here closes anything on age. `keep` snoozes, `fixed` needs proof, and
 * the proof for each card is shown on its own row so it can be checked.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoPopover } from "@/components/help/InfoPopover";
import { ruleBatch } from "@/lib/actions/commandCenter";
import { BATCH_MAX, errorMessageFor, stripOmiPrefix, type RuleErrorCode } from "@/lib/commandCenter/rules";
import { canApply, toApplyInput, type BatchGroup as Group } from "@/lib/commandCenter/batch";
import { ProofDialog, AssignDialog } from "./ProofDialog";
import { ReasonDialog } from "./ReasonDialog";

const VERB: Record<string, string> = {
  still_broken: "Mark still broken",
  fixed: "Close as fixed",
  no_longer_matters: "Close as no longer relevant",
  done: "Mark done",
  drop: "Drop",
  keep: "Keep for 30 days",
  assign: "Assign",
};

export function BatchGroup({ group, canRule }: { group: Group; canRule: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(() => new Set(group.items.map((i) => i.source_id)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [asking, setAsking] = useState<"none" | "assign" | "reason">("none");

  const ids = [...checked];
  const guard = canApply(group, ids);

  function apply(extra: { reason?: string; assignee?: string } = {}) {
    setError(null);
    setAsking("none");
    startTransition(async () => {
      const res = await ruleBatch(toApplyInput(group, ids, extra));
      if (res.ok) {
        setDone(`${VERB[group.verdict] ?? group.verdict} — ${ids.length} done. Undo it on the Decided tab.`);
        router.refresh();
        return;
      }
      const { text, reload } = errorMessageFor(res.code as RuleErrorCode, res.message);
      setError(text);
      if (reload) setTimeout(() => router.refresh(), 1200);
    });
  }

  function start() {
    // Assign is the one verdict that needs a value the group cannot supply.
    if (group.verdict === "assign") return setAsking("assign");
    apply();
  }

  if (done) {
    return (
      <Card>
        <CardContent className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">{done}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 text-left"
        >
          {open
            ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          <span className="text-sm font-medium text-navy-900 dark:text-slate-100">{group.label}</span>
          <Badge tone="slate">{group.total}</Badge>
          {group.capped ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              showing the first {BATCH_MAX}
            </span>
          ) : null}
          <span className="ml-auto">
            <InfoPopover helpKey="commandCenter.batchGroup" />
          </span>
        </button>

        {open ? (
          <ul className="space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
            {group.items.map((i) => {
              const on = checked.has(i.source_id);
              return (
                <li key={`${i.source_table}:${i.source_id}`} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!canRule || pending}
                    onChange={() => setChecked((prev) => {
                      const next = new Set(prev);
                      if (next.has(i.source_id)) next.delete(i.source_id); else next.add(i.source_id);
                      return next;
                    })}
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300 dark:border-slate-600"
                    aria-label={`include #${i.source_id}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-slate-700 dark:text-slate-200">{stripOmiPrefix(i.description)}</span>
                    <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500">
                      #{i.source_id}
                      {i.age_days == null ? "" : ` · ${i.age_days}d`}
                      {i.area ? ` · ${i.area}` : ""}
                    </span>
                    {/* The evidence, per card. A group header says what is true
                        of all of them; this says what is true of this one. */}
                    {i.proof ? (
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                        {i.proof}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {canRule ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={start} disabled={pending || !guard.ok}>
              {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
              {VERB[group.verdict] ?? group.verdict} ({guard.count})
            </Button>
            {group.items.length > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setChecked(checked.size ? new Set() : new Set(group.items.map((i) => i.source_id)))}
                className="text-xs text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {checked.size ? "Uncheck all" : "Check all"}
              </button>
            ) : null}
            {/* A disabled button that says nothing is a dead end. */}
            {!guard.ok ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">{guard.reason}</span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Read-only — passes are admin only.</p>
        )}

        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </CardContent>

      <AssignDialog
        open={asking === "assign"}
        pending={pending}
        onCancel={() => setAsking("none")}
        onConfirm={(assignee) => apply({ assignee })}
      />

      <ReasonDialog
        open={asking === "reason"}
        title="Say why"
        prompt="This pass goes against the suggestion."
        pending={pending}
        onCancel={() => setAsking("none")}
        onConfirm={(reason) => apply({ reason })}
      />
    </Card>
  );
}

/**
 * The proof dialog is not reached from a group: a batch of `fixed` uses the
 * proof the recommendation already cited, per card, and buildGroups drops any
 * card that has none. Asking for one line to cover fifty different issues would
 * be worse evidence than none at all.
 */
export { ProofDialog };
