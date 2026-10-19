"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { usdExact } from "@/lib/utils";
import { marketLabel } from "@/lib/scorecard/markets";
import { loadInvoiceDetail, settleInvoiceDispute, type InvoiceStage } from "@/lib/actions/marketingCost";
import type { InvoiceDetail, InvoiceDoc, InvoiceEditForm } from "@/lib/queries/marketingCost.core";
import { InvoiceDecide } from "./InvoiceDecide";

const STATE_TEXT: Record<InvoiceDetail["state"], string> = {
  none: "No dispute on this invoice.",
  open: "Part of this invoice was billed but not found in our records. It is not charged to any office until you settle it.",
  confirmed: "The disputed part was confirmed and is charged to the offices.",
  credited: "The vendor's credit was taken off this invoice.",
};

const defaultCredit = (d: InvoiceDetail) => (d.credited > 0 ? d.credited.toFixed(2) : d.disputed > 0 ? d.disputed.toFixed(2) : "");

const btn =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-8";

/**
 * "View & edit" on an invoice (the user, 2026-10-19: "a button that displays
 * the invoice and lets me update the credit received, confirm the charge, or
 * reopen a disputed amount"). Opens a side panel with the lines, the offices
 * each was charged to, what is disputed and what was credited, the original
 * file, Approve / Reject / Edit details / Reopen (InvoiceDecide), and the
 * three dispute actions. Only an admin (Mark, Brad) can change
 * it, the same people who decide invoices in Slack; LP-MCP does the work and
 * redraws the Slack card so both say the same thing.
 */
export function InvoiceDrawer({ doc, canEdit, initial = null }: { doc: InvoiceDoc; canEdit: boolean; initial?: InvoiceDetail | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [credit, setCredit] = useState(() => (initial ? defaultCredit(initial) : ""));
  const [edit, setEdit] = useState<{ form: InvoiceEditForm; vendors: { id: string; name: string }[]; stage: InvoiceStage; key: number } | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    const r = await loadInvoiceDetail(doc.id);
    if (r.ok) {
      setDetail(r.detail);
      setCredit(defaultCredit(r.detail));
      setEdit((e) => ({ form: r.form, vendors: r.vendors, stage: r.stage, key: (e?.key ?? 0) + 1 }));
    } else setError(r.error);
  }, [doc.id]);

  const run = (action: "accept" | "credit" | "reopen") =>
    start(async () => {
      setResult(null);
      const amount = action === "credit" ? Number(credit.replace(/[$,\s]/g, "")) : null;
      if (action === "credit" && !(Number.isFinite(amount) && (amount as number) > 0)) {
        setResult({ ok: false, text: "Enter the credit amount, above $0." });
        return;
      }
      const r = await settleInvoiceDispute(doc.id, action, amount);
      setResult(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error ?? "Not saved." });
      if (r.ok) {
        await load();
        router.refresh();
      }
    });

  const d = detail;
  const creditChanged = d && d.credited > 0 && Number(credit) !== d.credited;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!initial) void load();
        }}
        className={`${btn} border border-navy-200 bg-white text-navy-800 hover:bg-navy-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900`}
      >
        View &amp; edit
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${doc.vendor} · #${doc.invoice_number}`}
        subtitle={`${doc.period} · ${doc.total == null ? "no total read" : usdExact(doc.total)} · ${doc.status_label}`}
      >
        <div className="space-y-4 text-[13px]">
          {doc.has_file && (
            <a
              href={`/api/marketing-invoice/${doc.id}`}
              target="_blank"
              rel="noopener"
              className={`${btn} w-full border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`}
            >
              Open the invoice file
            </a>
          )}

          {error && <p className="rounded-md bg-brick-50 px-3 py-2 text-brick-700 dark:bg-brick-950/40 dark:text-brick-300">Could not load: {error}</p>}
          {!d && !error && <p className="text-slate-500">Loading…</p>}

          {d && (
            <>
              <dl className="grid grid-cols-2 gap-2">
                {[
                  ["Billed", d.billed],
                  ["Charged to offices", d.charged - d.disputed],
                  ["Disputed", d.disputed],
                  ["Credit received", d.credited],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-md border border-slate-200 px-2.5 py-2 dark:border-slate-800">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt>
                    <dd className="font-mono text-[14px] font-semibold tabular text-slate-900 dark:text-slate-100">{usdExact(v as number)}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-slate-600 dark:text-slate-300">{STATE_TEXT[d.state]}</p>

              <div className="space-y-2">
                {d.lines.map((l) => (
                  <div key={l.id} className="rounded-md border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-medium text-slate-800 dark:text-slate-100">{l.description}</span>
                      <span className="font-mono tabular text-slate-900 dark:text-slate-100">{usdExact(l.amount)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {l.period}
                      {l.status !== "approved" && <> · {l.status.replace("_", " ")}</>}
                      {l.credited > 0 && <> · billed {usdExact(l.billed)}, credit {usdExact(l.credited)}</>}
                      {l.confirmed && <> · disputed part confirmed</>}
                    </div>
                    {(l.offices.length > 0 || l.disputed > 0) && (
                      <ul className="mt-1.5 space-y-0.5 text-xs">
                        {l.offices.map((o) => (
                          <li key={o.market} className="flex justify-between gap-2 text-slate-600 dark:text-slate-300">
                            <span>{o.market === "REECE_HOLD" ? "Held at company level" : marketLabel(o.market)}</span>
                            <span className="font-mono tabular">{usdExact(o.amount)}</span>
                          </li>
                        ))}
                        {l.disputed > 0 && (
                          <li className="flex justify-between gap-2 font-medium text-brick-700 dark:text-brick-300">
                            <span>Disputed</span>
                            <span className="font-mono tabular">{usdExact(l.disputed)}</span>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {edit && (
                <InvoiceDecide
                  key={edit.key}
                  documentId={doc.id}
                  stage={edit.stage}
                  form={edit.form}
                  vendors={edit.vendors}
                  canEdit={canEdit}
                  onDone={async () => {
                    await load();
                    router.refresh();
                  }}
                />
              )}

              {(d.canConfirm || d.canCredit || d.canReopen) && (
                <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <h3 className="font-display text-sm font-semibold text-navy-900 dark:text-white">Settle the dispute</h3>
                  {!canEdit && (
                    <p className="text-xs text-amber-800 dark:text-amber-300">Only Mark or Brad can change an invoice. Ask one of them to do it.</p>
                  )}

                  {d.canCredit && (
                    <div className="space-y-1.5">
                      <label htmlFor={`credit-${doc.id}`} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                        Credit received{d.creditMax != null ? ` (up to ${usdExact(d.creditMax)})` : ""}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          id={`credit-${doc.id}`}
                          inputMode="decimal"
                          value={credit}
                          onChange={(e) => setCredit(e.target.value)}
                          disabled={!canEdit || pending}
                          placeholder="0.00"
                          className="h-9 w-full min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 font-mono text-base tabular text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:h-8 sm:w-40 sm:text-sm"
                        />
                        <button
                          type="button"
                          disabled={!canEdit || pending}
                          onClick={() => run("credit")}
                          className={`${btn} bg-navy-800 text-white hover:bg-navy-900`}
                        >
                          {d.credited > 0 ? (creditChanged ? "Update credit" : "Save credit") : "Record credit"}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">The credit comes off the invoice. Any part you do not credit stays Disputed.</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {d.canConfirm && (
                      <button
                        type="button"
                        disabled={!canEdit || pending}
                        onClick={() => run("accept")}
                        className={`${btn} border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200`}
                      >
                        Confirm charge ({usdExact(d.disputed)})
                      </button>
                    )}
                    {d.canReopen && (
                      <button
                        type="button"
                        disabled={!canEdit || pending}
                        onClick={() => run("reopen")}
                        className={`${btn} border border-brick-300 bg-white text-brick-700 hover:bg-brick-50 dark:border-brick-800 dark:bg-slate-950 dark:text-brick-300`}
                      >
                        Reopen dispute
                      </button>
                    )}
                  </div>
                  {pending && <p className="text-xs text-slate-500">Saving…</p>}
                  {result && (
                    <p className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-400" : "text-brick-700 dark:text-brick-300"}`}>{result.text}</p>
                  )}
                </div>
              )}

              {d.log.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">History</h3>
                  <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {[...d.log].reverse().map((e, i) => (
                      <li key={i} className="break-words">
                        <Badge tone={e.action === "reopen" ? "rose" : e.action === "accept" ? "emerald" : "navy"}>
                          {e.action === "accept" ? "Confirmed" : e.action === "credit" ? "Credit" : "Reopened"}
                        </Badge>{" "}
                        {usdExact(e.amount)} · {String(e.by ?? "").replace(/ \(.*\)$/, "")} · {String(e.at ?? "").slice(0, 16).replace("T", " ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
