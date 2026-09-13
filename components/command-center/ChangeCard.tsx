"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, ExternalLink, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Working } from "@/components/ui/Working";
import { setLane, generatePrompt, approveChange, rejectChange, linkPr } from "@/lib/actions/changes";
import { LANE_LABEL, REPO_LABEL, canGeneratePrompt, type ChangeLane, type ChangeRepo } from "@/lib/changes/buildPrompt";
import type { ChangeRow } from "@/lib/queries/changes";
import { CHANGE_STATUS_META } from "./changeMeta";

/**
 * One change in the Changes lane.
 *
 * Reads top to bottom in the order the question is actually answered: what this
 * is, where it came from, what is proposed, and only then the buttons — the same
 * shape as RulingCard, for the same reason.
 *
 * Most rows have NO decision behind them. The 198 backfilled items were captured
 * during working sessions, not filed by a ruling, so the card says that plainly
 * rather than rendering an empty "why" panel. A missing chain shown as missing is
 * information; shown as a blank box it is a bug report.
 */
export function ChangeCard({ change, canEdit }: { change: ChangeRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [prRef, setPrRef] = useState("");

  const meta = CHANGE_STATUS_META[change.status] ?? CHANGE_STATUS_META.proposed;
  const busy = (key: string) => pending && activeKey === key;

  /** Every action goes through here so the busy key and errors behave the same. */
  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; prompt?: string }>,
    after?: (prompt?: string) => void) {
    setError(null);
    setNote(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      setActiveKey(null);
      if (!res.ok) { setError(res.error ?? "That didn't save."); return; }
      after?.(res.prompt);
      router.refresh();
    });
  }

  /** Generate, then put it straight on the clipboard — that is the whole point. */
  function generateAndCopy() {
    run("prompt", () => generatePrompt(change.id), async (prompt) => {
      if (!prompt) return;
      try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Clipboard is blocked in some browsers without a user gesture chain.
        // The prompt is saved either way, so say where it is rather than failing.
        setNote("Prompt saved — open it below to copy by hand.");
      }
    });
  }

  async function copyStored() {
    if (!change.prompt_text) return;
    try {
      await navigator.clipboard.writeText(change.prompt_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNote("Couldn't reach the clipboard — select the text below and copy it.");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        {/* ── what this is ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {change.lane ? <Badge tone="navy">{LANE_LABEL[change.lane]}</Badge> : (
            <Badge tone="amber">Lane not set</Badge>
          )}
          {change.repo ? <Badge tone="slate">{REPO_LABEL[change.repo]}</Badge> : null}
          {change.area ? <Badge tone="slate">{change.area}</Badge> : null}
          {change.needs_manual ? <Badge tone="rose">Needs manual work</Badge> : null}
          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
            #{change.id}
            {change.prompt_version > 0 ? ` · prompt v${change.prompt_version}` : ""}
          </span>
        </div>

        <p className="text-sm font-medium text-navy-900 dark:text-slate-100">{change.title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{meta.hint}</p>

        {/* ── where it came from ─────────────────────────────────────── */}
        {change.decision_text ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              The decision this implements
            </div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{change.decision_text}</p>
            {change.decision_rationale ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{change.decision_rationale}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Captured during a working session — no Command Center decision behind it.
            {change.ref ? <> Referenced <span className="font-medium">{change.ref}</span>.</> : null}
          </p>
        )}

        {/* ── what is proposed ───────────────────────────────────────── */}
        {change.summary && change.summary !== change.title ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{change.summary}</p>
        ) : null}

        {change.pr_url || change.pr_number ? (
          <a
            href={change.pr_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-navy-700 underline dark:text-slate-300"
          >
            <ExternalLink className="h-3 w-3" aria-hidden /> PR #{change.pr_number}
            {change.ci_conclusion ? ` · CI ${change.ci_conclusion}` : " · CI running"}
          </a>
        ) : null}

        {change.reject_reason ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rejected: {change.reject_reason}
          </p>
        ) : null}

        {/* ── the buttons ────────────────────────────────────────────── */}
        {!canEdit ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Lock className="h-3 w-3" aria-hidden /> Read-only — changes are admin only.
          </p>
        ) : (
          <div className="space-y-2">
            {/* The lane decides which prompt gets written, so it comes first and
                the generate button stays disabled until it is set. */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={change.lane ?? ""}
                disabled={pending}
                onChange={(e) => {
                  const lane = e.target.value as ChangeLane;
                  run("lane", () => setLane(change.id, lane, lane === "code" ? (change.repo ?? "lp") : null));
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-navy-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="" disabled>Lane…</option>
                {(Object.keys(LANE_LABEL) as ChangeLane[]).map((l) => (
                  <option key={l} value={l}>{LANE_LABEL[l]}</option>
                ))}
              </select>

              {change.lane === "code" ? (
                <select
                  value={change.repo ?? ""}
                  disabled={pending}
                  onChange={(e) => run("repo", () => setLane(change.id, "code", e.target.value as ChangeRepo))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-navy-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="" disabled>Repo…</option>
                  {(Object.keys(REPO_LABEL) as ChangeRepo[]).map((r) => (
                    <option key={r} value={r}>{REPO_LABEL[r]}</option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={pending || !canGeneratePrompt(change)}
                onClick={generateAndCopy}
                title={canGeneratePrompt(change) ? undefined : "Set the lane first"}
              >
                {busy("prompt") ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                {change.prompt_text ? "Regenerate prompt" : "Generate prompt"}
              </Button>

              {change.prompt_text ? (
                <Button variant="secondary" size="sm" disabled={pending} onClick={copyStored}>
                  {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                  {copied ? "Copied" : "Copy prompt"}
                </Button>
              ) : null}

              {change.status === "proposed" ? (
                <Button variant="secondary" size="sm" disabled={pending}
                  onClick={() => run("approve", () => approveChange(change.id))}>
                  {busy("approve") ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                  Approve
                </Button>
              ) : null}

              {change.status !== "rejected" ? (
                <Button variant="danger" size="sm" disabled={pending} onClick={() => setRejecting((v) => !v)}>
                  Reject
                </Button>
              ) : null}
            </div>

            {rejecting ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Why are you turning this down?
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Already done, no longer applies, wrong approach…"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" disabled={pending || !reason.trim()}
                    onClick={() => run("reject", () => rejectChange(change.id, reason), () => setRejecting(false))}>
                    {busy("reject") ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    Confirm rejection
                  </Button>
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Manual until Phase 3 reads the `Change #<id>` marker off the PR. */}
            {change.status === "approved" && !change.pr_number ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={prRef}
                  onChange={(e) => setPrRef(e.target.value)}
                  placeholder="Paste the PR link once it's open"
                  className="min-w-[16rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <Button variant="secondary" size="sm" disabled={pending || !prRef.trim()}
                  onClick={() => run("pr", () => linkPr(change.id, prRef), () => setPrRef(""))}>
                  {busy("pr") ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                  Link PR
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {pending && activeKey === null ? <Working label="Saving" /> : null}

        {change.prompt_text ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              Show the prompt
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {change.prompt_text}
            </pre>
          </details>
        ) : null}

        {note ? <p className="text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}
        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
