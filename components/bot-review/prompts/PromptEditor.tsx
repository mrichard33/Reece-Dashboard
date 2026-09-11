"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, History, Power, RotateCcw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  saveDraft,
  discardDraft,
  activatePrompt,
  rollbackPrompt,
  togglePrompt,
} from "@/lib/actions/prompts";
import type { PromptDetail } from "@/lib/mcp/prompts";
import {
  BODY_FIELDS,
  SETTING_FIELDS,
  RULE_FIELDS,
  fieldLabel,
  unknownPlaceholders,
  type FieldSpec,
} from "./promptFields";

/**
 * Edit one live prompt.
 *
 * The whole design turns on one fact: agentic_messaging_prompts is read live on
 * every generation, so there is no deploy between Activate and a real customer
 * message. Everything here is built to make that boundary impossible to cross
 * by accident —
 *
 *   · Typing changes local state only.
 *   · Save draft stores the change where the bot cannot see it.
 *   · Activate is the ONLY control that changes what customers receive, it
 *     names what is changing, and it asks first.
 *
 * The server re-validates and re-checks permission on every one of these; the
 * disabled buttons below are a courtesy, not the gate.
 */

type Values = Record<string, unknown>;

/** Compare by value — lists and schemas are objects and never === each other. */
function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function toInput(kind: FieldSpec["kind"], v: unknown): string {
  if (v === null || v === undefined) return "";
  if (kind === "list") return Array.isArray(v) ? v.join("\n") : String(v);
  if (kind === "json") return JSON.stringify(v, null, 2);
  return String(v);
}

function fromInput(kind: FieldSpec["kind"], raw: string): unknown {
  const trimmed = raw.trim();
  if (kind === "list") {
    const items = raw.split("\n").map((s) => s.trim()).filter(Boolean);
    // An empty box means "no rules", which the column spells as NULL rather
    // than an empty array — the selector treats the two the same but the
    // change log should not show [] where it used to show nothing.
    return items.length ? items : null;
  }
  if (kind === "number") return trimmed === "" ? null : Number(trimmed);
  return trimmed === "" ? null : raw;
}

export function PromptEditor({ detail }: { detail: PromptDetail }) {
  const router = useRouter();
  const { prompt, draft, history, canEdit, needsMigration } = detail;

  // The starting point is the live row with any saved draft already applied,
  // so reopening a prompt shows the draft rather than silently discarding it.
  const base = useMemo<Values>(
    () => ({ ...prompt, ...(draft?.fields ?? {}) }),
    [prompt, draft],
  );

  const [values, setValues] = useState<Values>(base);
  const [note, setNote] = useState(draft?.note ?? "");
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  /** Only the fields that differ from the LIVE row — what a draft stores. */
  const patch = useMemo(() => {
    const out: Values = {};
    for (const key of Object.keys(values)) {
      if (!same(values[key], prompt[key])) out[key] = values[key];
    }
    return out;
  }, [values, prompt]);

  const changedKeys = Object.keys(patch);
  const dirty = changedKeys.length > 0;
  const savedDraftKeys = Object.keys(draft?.fields ?? {});
  // Unsaved = the editor differs from what the draft has stored.
  const unsaved = !same(patch, draft?.fields ?? {});

  const templateWarnings = unknownPlaceholders(String(values.user_prompt_template ?? ""));

  function set(key: string, raw: string, kind: FieldSpec["kind"]) {
    setMsg(null);
    setValues((v) => ({ ...v, [key]: fromInput(kind, raw) }));
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startBusy(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ tone: "bad", text: res.error ?? "That didn't work." });
        return;
      }
      setMsg({ tone: "ok", text: okText });
      setConfirmActivate(false);
      router.refresh();
    });
  }

  const disabled = !canEdit || busy || needsMigration;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-sm font-semibold text-navy-900 dark:text-white">
            {prompt.prompt_code}
            <Badge tone={prompt.active ? "emerald" : "slate"}>{prompt.active ? "Live" : "Off"}</Badge>
            {savedDraftKeys.length > 0 && <Badge tone="amber">Draft saved</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {prompt.workflow_code} · {prompt.channel} · version {prompt.version}
            {draft?.updated_by ? ` · draft by ${draft.updated_by}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            <History className="h-3.5 w-3.5" /> History ({history.length})
          </Button>
          <Button
            variant={prompt.active ? "secondary" : "primary"}
            size="sm"
            disabled={disabled}
            onClick={() =>
              run(
                () => togglePrompt(prompt.id, !prompt.active),
                prompt.active
                  ? "Turned off. The bot will stop using this prompt immediately."
                  : "Turned on. The bot can use this prompt from the next message.",
              )
            }
          >
            <Power className="h-3.5 w-3.5" /> {prompt.active ? "Turn off" : "Turn on"}
          </Button>
        </div>
      </div>

      {needsMigration && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Drafts are not set up yet. Apply{" "}
          <span className="font-mono">sql/107_prompt_drafts.sql</span> in the LP Supabase SQL editor
          to edit prompts. You can still read them, and the bot is unaffected.
        </p>
      )}

      {!canEdit && !needsMigration && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          You can read these prompts but not change them. Editing is limited to operators, because a
          change here reaches customers on the next message.
        </p>
      )}

      {msg && (
        <p
          role={msg.tone === "bad" ? "alert" : "status"}
          className={
            "rounded-lg px-3 py-2 text-xs font-medium " +
            (msg.tone === "bad"
              ? "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200")
          }
        >
          {msg.text}
        </p>
      )}

      {/* ── What's changing ────────────────────────────────────── */}
      {dirty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            What&apos;s changing ({changedKeys.length})
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {changedKeys.map((k) => (
              <li key={k} className="text-xs text-amber-900 dark:text-amber-200">
                · {fieldLabel(k)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300">
            {unsaved
              ? "Not saved yet. Nothing reaches customers until you activate."
              : "Saved as a draft. Nothing reaches customers until you activate."}
          </p>
        </div>
      )}

      {/* ── History ────────────────────────────────────────────── */}
      {showHistory && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No changes recorded yet. Every activation and rollback is logged here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-navy-900 dark:text-white">
                      {h.action === "promoted_live"
                        ? "Activated"
                        : h.action === "rolled_back"
                          ? "Rolled back"
                          : h.action === "retired"
                            ? "Turned off"
                            : h.action}{" "}
                      by {h.actor}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(h.at).toLocaleString()}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </p>
                  </div>
                  {h.before && canEdit && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        run(
                          () => rollbackPrompt(prompt.id, h.id),
                          "Rolled back. The previous wording is live from the next message.",
                        )
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Roll back
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── The prompt itself ──────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {BODY_FIELDS.map((f) => (
          <Field
            key={f.key}
            spec={f}
            value={values[f.key]}
            live={prompt[f.key]}
            disabled={disabled}
            onChange={(raw) => set(f.key, raw, f.kind)}
            warnings={f.key === "user_prompt_template" ? templateWarnings : []}
          />
        ))}
      </div>

      <Section title="Settings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SETTING_FIELDS.map((f) => (
            <Field
              key={f.key}
              spec={f}
              value={values[f.key]}
              live={prompt[f.key]}
              disabled={disabled}
              onChange={(raw) => set(f.key, raw, f.kind)}
            />
          ))}
        </div>
      </Section>

      <Section title="Rules and labels">
        <div className="grid gap-3 sm:grid-cols-2">
          {RULE_FIELDS.map((f) => (
            <Field
              key={f.key}
              spec={f}
              value={values[f.key]}
              live={prompt[f.key]}
              disabled={disabled}
              onChange={(raw) => set(f.key, raw, f.kind)}
            />
          ))}
        </div>
      </Section>

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-[var(--background)] py-3 dark:border-slate-800">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled}
          placeholder="Why are you changing this? (optional)"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-navy-900 placeholder:text-slate-400 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />

        <Button
          variant="secondary"
          size="md"
          disabled={disabled || !unsaved || !dirty}
          onClick={() => run(() => saveDraft(prompt.id, patch, note || null), "Draft saved. Nothing has reached customers.")}
        >
          <Save className="h-3.5 w-3.5" /> Save draft
        </Button>

        {savedDraftKeys.length > 0 && (
          <Button
            variant="ghost"
            size="md"
            disabled={disabled}
            onClick={() => run(() => discardDraft(prompt.id), "Draft discarded.")}
          >
            <Trash2 className="h-3.5 w-3.5" /> Discard
          </Button>
        )}

        <Button
          variant="danger"
          size="md"
          // Activate promotes the SAVED draft, so an unsaved edit must be saved
          // first — otherwise the button would silently activate older text.
          disabled={disabled || savedDraftKeys.length === 0 || unsaved}
          onClick={() => setConfirmActivate(true)}
        >
          <Check className="h-3.5 w-3.5" /> Activate
        </Button>
      </div>

      {confirmActivate && (
        <ConfirmActivate
          promptCode={prompt.prompt_code}
          fields={savedDraftKeys.map(fieldLabel)}
          busy={busy}
          onCancel={() => setConfirmActivate(false)}
          onConfirm={() =>
            run(
              () => activatePrompt(prompt.id, note || null),
              "Activated. This wording is live from the next message.",
            )
          }
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  spec,
  value,
  live,
  disabled,
  onChange,
  warnings = [],
}: {
  spec: FieldSpec;
  value: unknown;
  live: unknown;
  disabled: boolean;
  onChange: (raw: string) => void;
  warnings?: string[];
}) {
  const changed = !same(value, live);
  const text = toInput(spec.kind, value);
  const long = spec.kind === "longtext" || spec.kind === "list" || spec.kind === "json";

  const inputClass =
    "w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-navy-900 placeholder:text-slate-400 disabled:opacity-60 dark:bg-slate-900 dark:text-white " +
    (changed
      ? "border-amber-400 dark:border-amber-600"
      : "border-slate-300 dark:border-slate-700");

  return (
    <label className={spec.kind === "longtext" ? "block" : "block min-w-0"}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-navy-900 dark:text-white">
        {spec.label}
        {changed && <Badge tone="amber">changed</Badge>}
      </span>
      {spec.help && (
        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{spec.help}</span>
      )}

      {long ? (
        <textarea
          value={text}
          rows={spec.rows ?? 4}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} mt-1 font-mono text-xs leading-relaxed`}
          spellCheck={spec.kind === "longtext"}
        />
      ) : (
        <input
          type={spec.kind === "number" ? "number" : "text"}
          value={text}
          step={spec.step}
          min={spec.min}
          max={spec.max}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} mt-1`}
        />
      )}

      {warnings.length > 0 && (
        <span className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>
            {warnings.map((w) => `{{${w}}}`).join(", ")}{" "}
            {warnings.length === 1 ? "isn't something" : "aren't things"} the bot can fill in, so{" "}
            {warnings.length === 1 ? "it" : "they"} would come out blank. Start the name with one of:
            lead, lp, nurture, nurture_state, intelligence, engagement, scarcity_real.
          </span>
        </span>
      )}
    </label>
  );
}

/**
 * The last step before a change reaches a customer. Names the prompt and what
 * is changing — "are you sure?" on its own tells the operator nothing they can
 * check.
 */
function ConfirmActivate({
  promptCode,
  fields,
  busy,
  onCancel,
  onConfirm,
}: {
  promptCode: string;
  fields: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-base font-semibold text-navy-900 dark:text-white">
          Put this live?
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          <span className="font-mono text-xs">{promptCode}</span> will use the new wording on the
          next message it sends. There is no delay and no further approval step.
        </p>
        <ul className="mt-2.5 space-y-0.5 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
          {fields.map((f) => (
            <li key={f} className="text-xs text-slate-700 dark:text-slate-200">
              · {f}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          You can roll this back from History at any time.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} disabled={busy}>
            {busy ? "Activating…" : "Yes, put it live"}
          </Button>
        </div>
      </div>
    </div>
  );
}
