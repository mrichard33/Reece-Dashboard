"use client";

import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";

export type GuardMatch = { id: number; text: string; similarity: number };

/**
 * The conflict guard, surfaced as a question rather than an error.
 *
 * memory_rule refuses to file a new active decision that looks like one already
 * on the books — that is how memory ends up holding two contradictory truths.
 * It comes back with the match instead, and this asks the only question that
 * settles it: is this REPLACING that decision, or SAYING THE SAME THING?
 *
 * Replace supersedes the old one. Same thing writes nothing new — it just
 * re-confirms the existing decision with today's date.
 */
export function GuardDialog({
  open, match, pending, onCancel, onReplace, onSame,
}: {
  open: boolean;
  match: GuardMatch | null;
  pending?: boolean;
  onCancel: () => void;
  onReplace: (id: number) => void;
  onSame: (id: number) => void;
}) {
  if (!match) return null;
  const pct = Math.round(match.similarity * 100);

  return (
    <Drawer
      open={open}
      onClose={onCancel}
      title="We already have one like this"
      subtitle={`This looks like decision #${match.id} (${pct}% match).`}
    >
      <div className="space-y-4">
        <blockquote className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-navy-900 dark:bg-amber-950/40 dark:text-slate-100">
          {match.text}
        </blockquote>

        <p className="text-sm text-slate-600 dark:text-slate-300">
          Which is it?
        </p>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li><strong>Replace it</strong> — yours is the new truth; #{match.id} is marked superseded.</li>
          <li><strong>Same thing</strong> — nothing new is written; #{match.id} is re-confirmed with today&apos;s date.</li>
        </ul>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant="secondary" disabled={pending} onClick={() => onSame(match.id)}>
            Same thing
          </Button>
          <Button disabled={pending} onClick={() => onReplace(match.id)}>
            {pending ? "Saving…" : `Replace #${match.id}`}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
