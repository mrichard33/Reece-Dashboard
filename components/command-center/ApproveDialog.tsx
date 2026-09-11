"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { CATEGORIES, prefillDecisionText, type QueueCard } from "@/lib/commandCenter/rules";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const labelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

export type ApproveResult = {
  text: string;
  category: string;
  build?: { description: string };
};

/**
 * The dialog behind "Edit, then approve", "Write my own answer" and a conflict's
 * "Write a new answer" — anywhere the exact words being saved matter.
 *
 * MOUNTED ONLY WHILE OPEN (the caller renders it conditionally), so the fields
 * seed themselves once at construction and reset on close. That is deliberate:
 * re-seeding from a prop inside an effect would overwrite whatever was being
 * typed the moment the card re-rendered underneath.
 *
 * The text box is prefilled with the card's own words, Omi provenance stripped,
 * because THAT is what gets written to claude_decision_log. Whatever is in this
 * box is the sentence someone reads back in six months.
 *
 * "Needs building" is off by default. A decision is a decision; only ticking the
 * box files work against it.
 */
export function ApproveDialog({
  card, title, pending, onCancel, onConfirm,
}: {
  card: QueueCard;
  title: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (result: ApproveResult) => void;
}) {
  const [text, setText] = useState(() => prefillDecisionText(card));
  const [category, setCategory] = useState(() =>
    card.rec_category && (CATEGORIES as readonly string[]).includes(card.rec_category)
      ? card.rec_category
      : "operations",
  );
  const [needsBuild, setNeedsBuild] = useState(() => Boolean(card.rec_build_text));
  const [buildText, setBuildText] = useState(() => card.rec_build_text ?? "");

  const canSave = text.trim().length > 0 && (!needsBuild || buildText.trim().length > 0);

  return (
    <Drawer
      open
      onClose={onCancel}
      title={title}
      subtitle="This exact wording is what gets saved to memory."
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>The decision</label>
          <textarea
            autoFocus
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="rounded border-slate-300 dark:border-slate-600"
              checked={needsBuild}
              onChange={(e) => setNeedsBuild(e.target.checked)}
            />
            Needs building
          </label>
          {needsBuild ? (
            <div className="mt-2">
              <label className={labelClass}>What has to be built</label>
              <textarea
                rows={3}
                value={buildText}
                onChange={(e) => setBuildText(e.target.value)}
                placeholder="The work this decision creates."
                className={inputClass}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              No build needed — the decision is recorded and closed out.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending || !canSave}
            onClick={() =>
              onConfirm({
                text: text.trim(),
                category,
                build: needsBuild ? { description: buildText.trim() } : undefined,
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
