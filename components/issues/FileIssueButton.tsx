"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { createIssue } from "@/lib/actions/issues";
import type { ClaudeKnownIssue } from "@/lib/supabase/types";

type Severity = NonNullable<ClaudeKnownIssue["severity"]>;
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm transition focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const labelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

/**
 * Primary "File issue" action for the Issues panel. Lives in the TopBar; opens
 * a Drawer with a create-issue form that writes via the `createIssue` action.
 */
export function FileIssueButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [category, setCategory] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [impact, setImpact] = useState("");

  function close() {
    setOpen(false);
    setError(null);
  }

  function reset() {
    setDescription("");
    setSeverity("medium");
    setCategory("");
    setWorkflowName("");
    setImpact("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    startTransition(async () => {
      const res = await createIssue({
        description,
        severity,
        category,
        workflow_name: workflowName,
        impact,
      });
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not file the issue.");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-navy-900 hover:bg-navy-800">
        <Plus className="h-4 w-4" /> File issue
      </Button>

      <Drawer
        open={open}
        onClose={close}
        title="File an issue"
        subtitle="Logs a new row to claude_known_issues, status open."
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="issue-description" className={labelClass}>
              Description <span className="text-brick">*</span>
            </label>
            <textarea
              id="issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              placeholder="What's wrong, in one or two sentences."
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="issue-severity" className={labelClass}>
              Severity
            </label>
            <select
              id="issue-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className={inputClass}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="issue-category" className={labelClass}>
              Category
            </label>
            <input
              id="issue-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. data drift, automation, architecture"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="issue-workflow" className={labelClass}>
              Workflow
            </label>
            <input
              id="issue-workflow"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Related workflow name (optional)"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="issue-impact" className={labelClass}>
              Impact
            </label>
            <textarea
              id="issue-impact"
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              rows={2}
              placeholder="Who/what is affected (optional)."
              className={inputClass}
            />
          </div>

          {error && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Filing…" : "File issue"}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
