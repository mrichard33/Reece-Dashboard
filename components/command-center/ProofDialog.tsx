"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";

/**
 * Asked for whenever something is being closed as FIXED or marked VERIFIED.
 *
 * An issue closed on a guess is worse than one left open, because nobody ever
 * re-opens a resolved issue to check. So "Fixed" is the one button on the stale
 * lane that costs a line of evidence — and "Still broken", the honest answer
 * when you do not know, costs nothing. That asymmetry is the whole design:
 * make the safe answer free and the closing answer cheap-but-not-free.
 *
 * claude_rule_batch refuses a proof-less `fixed` anyway. This dialog exists so
 * the person finds out before they click, with somewhere to put the link,
 * rather than after, with an error.
 *
 * Any of the three is enough — a PR, a file path, or a sentence saying what was
 * checked. It is not validated as a URL: "ran the MOD report on 09-14 and the
 * CCC rows are there" is better evidence than a link to a PR nobody read.
 */
export function ProofDialog({
  open, title, subtitle, pending, count, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  pending?: boolean;
  /** Set when this proof will close more than one card. */
  count?: number;
  onCancel: () => void;
  onConfirm: (proof: string) => void;
}) {
  const [proof, setProof] = useState("");

  function close() { setProof(""); onCancel(); }

  return (
    <Drawer open={open} onClose={close} title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            What fixed it
          </label>
          <textarea
            autoFocus
            rows={3}
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder="A merged PR, a commit, a file path — or a line saying what you checked and when."
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {count && count > 1
              ? `This closes ${count} issues, and this line is what each of them will show in six months.`
              : "This is what the issue will show in six months, so make it something you could follow."}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
          <Button onClick={() => onConfirm(proof.trim())} disabled={pending || !proof.trim()}>
            {pending ? "Saving…" : count && count > 1 ? `Close ${count} as fixed` : "Close as fixed"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}

/**
 * Who owns this now. Separate from the proof box because they ask different
 * questions, and a shared "type something" dialog would have to guess which.
 */
export function AssignDialog({
  open, pending, onCancel, onConfirm,
}: {
  open: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (assignee: string) => void;
}) {
  const [who, setWho] = useState("");

  function close() { setWho(""); onCancel(); }

  return (
    <Drawer open={open} onClose={close} title="Give this to someone" subtitle="It stays open — it just has a name on it.">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Owner
          </label>
          <input
            autoFocus
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="A name — Amanda, Chris, Mark"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
          <Button onClick={() => onConfirm(who.trim())} disabled={pending || !who.trim()}>
            {pending ? "Saving…" : "Assign"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
