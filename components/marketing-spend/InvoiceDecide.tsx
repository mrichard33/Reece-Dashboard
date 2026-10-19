"use client";

import { useState, useTransition } from "react";
import { decideInvoice, type InvoiceStage } from "@/lib/actions/marketingCost";
import { SCORECARD_MARKETS } from "@/lib/scorecard/markets";
import type { InvoiceEditForm, InvoiceSplit } from "@/lib/queries/marketingCost.core";

const btn =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-8";
const input =
  "h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 text-base text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:h-8 sm:text-sm";
const label = "block text-xs font-medium text-slate-600 dark:text-slate-300";

const SPLITS: { value: InvoiceSplit; text: string }[] = [
  { value: "by_source", text: "By the source's issued leads" },
  { value: "software", text: "Software: evenly across all offices" },
  { value: "call_center", text: "Call center: evenly across all offices" },
  { value: "even", text: "Evenly across all offices" },
  { value: "markets", text: "Only the offices I pick" },
];

/**
 * The invoice's own decisions in the invoice view (the user, 2026-10-19: "View
 * and Edit … doesn't allow any edits"): Approve / Reject / Edit details while it
 * is in review, Reopen once decided (to edit it again). The same choices as the
 * Slack card and its Edit form; LP-MCP runs that same handler.
 */
export function InvoiceDecide({
  documentId,
  stage,
  form: initialForm,
  vendors,
  canEdit,
  onDone,
}: {
  documentId: string;
  stage: InvoiceStage;
  form: InvoiceEditForm;
  vendors: { id: string; name: string }[];
  canEdit: boolean;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof InvoiceEditForm>(k: K, v: InvoiceEditForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const act = (action: "approve" | "reject" | "reopen" | "edit") =>
    start(async () => {
      setResult(null);
      if (action === "reject" && !window.confirm("Reject this invoice? It will not count in any market cost.")) return;
      const edit = action === "edit"
        ? {
            vendor_id: form.vendor_id,
            invoice_number: form.invoice_number,
            period_start: form.period_start,
            period_end: form.period_end,
            amount: form.one_line ? form.amount : "",
            lp_sub_sources: form.lp_sub_sources,
            split: form.split,
            eligible_markets: form.split === "markets" ? form.eligible_markets : [],
          }
        : null;
      const r = await decideInvoice(documentId, action, edit);
      setResult(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error ?? "Not saved." });
      if (r.ok) {
        if (action === "edit") setEditing(false);
        await onDone();
      }
    });

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="font-display text-sm font-semibold text-navy-900 dark:text-white">
        {stage.in_review ? "Review this invoice" : "Change this invoice"}
      </h3>
      {!canEdit && <p className="text-xs text-amber-800 dark:text-amber-300">Only Mark or Brad can change an invoice.</p>}

      <div className="flex flex-wrap gap-2">
        {stage.in_review && (
          <>
            <button type="button" disabled={!canEdit || pending} onClick={() => act("approve")} className={`${btn} bg-navy-800 text-white hover:bg-navy-900`}>
              Approve
            </button>
            <button
              type="button"
              disabled={!canEdit || pending}
              onClick={() => setEditing((e) => !e)}
              className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100`}
            >
              {editing ? "Close edit" : "Edit details"}
            </button>
            <button type="button" disabled={!canEdit || pending} onClick={() => act("reject")} className={`${btn} border border-brick-300 bg-white text-brick-700 hover:bg-brick-50 dark:border-brick-800 dark:bg-slate-950 dark:text-brick-300`}>
              Reject
            </button>
          </>
        )}
        {!stage.in_review && stage.decided && (
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={() => act("reopen")}
            className={`${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100`}
          >
            Reopen to edit
          </button>
        )}
      </div>
      {!stage.in_review && stage.decided && (
        <p className="text-[11px] text-slate-500">Reopening takes it out of the market costs and back to review, where you can edit and approve it again.</p>
      )}

      {stage.in_review && editing && (
        <div className="space-y-2.5 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div>
            <label className={label} htmlFor={`v-${documentId}`}>Vendor</label>
            <select id={`v-${documentId}`} value={form.vendor_id} onChange={(e) => set("vendor_id", e.target.value)} disabled={pending} className={input}>
              <option value="">(as read from the invoice)</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor={`n-${documentId}`}>Invoice number</label>
            <input id={`n-${documentId}`} value={form.invoice_number} onChange={(e) => set("invoice_number", e.target.value)} disabled={pending} className={input} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`s-${documentId}`}>Service from</label>
              <input id={`s-${documentId}`} type="date" value={form.period_start} onChange={(e) => set("period_start", e.target.value)} disabled={pending} className={input} />
            </div>
            <div>
              <label className={label} htmlFor={`e-${documentId}`}>Service to</label>
              <input id={`e-${documentId}`} type="date" value={form.period_end} onChange={(e) => set("period_end", e.target.value)} disabled={pending} className={input} />
            </div>
          </div>
          {form.one_line && (
            <div>
              <label className={label} htmlFor={`a-${documentId}`}>Amount</label>
              <input id={`a-${documentId}`} inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} disabled={pending} className={`${input} font-mono tabular`} />
            </div>
          )}
          <div>
            <label className={label} htmlFor={`h-${documentId}`}>How to split it</label>
            <select id={`h-${documentId}`} value={form.split} onChange={(e) => set("split", e.target.value as InvoiceSplit)} disabled={pending} className={input}>
              {SPLITS.map((s) => <option key={s.value} value={s.value}>{s.text}</option>)}
            </select>
          </div>
          {(form.split === "by_source" || form.split === "markets") && (
            <div>
              <label className={label} htmlFor={`ss-${documentId}`}>LP sub-source</label>
              <input id={`ss-${documentId}`} value={form.lp_sub_sources} onChange={(e) => set("lp_sub_sources", e.target.value)} disabled={pending} placeholder="e.g. Vis PPC" className={input} />
            </div>
          )}
          {form.split === "markets" && (
            <fieldset>
              <legend className={label}>Offices</legend>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1.5">
                {SCORECARD_MARKETS.map((m) => (
                  <label key={m.code} className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={form.eligible_markets.includes(m.code)}
                      disabled={pending}
                      onChange={(e) => set("eligible_markets", e.target.checked ? [...form.eligible_markets, m.code] : form.eligible_markets.filter((x) => x !== m.code))}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <button type="button" disabled={!canEdit || pending} onClick={() => act("edit")} className={`${btn} w-full bg-navy-800 text-white hover:bg-navy-900`}>
            Save changes
          </button>
          <p className="text-[11px] text-slate-500">Saving keeps it in review. Approve it when it looks right.</p>
        </div>
      )}

      {pending && <p className="text-xs text-slate-500">Saving…</p>}
      {result && <p className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-brick-700 dark:text-brick-300"}`}>{result.text}</p>}
    </div>
  );
}
