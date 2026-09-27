"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { fileDispute, decideDispute } from "@/lib/actions/payroll";
import { DISPUTABLE_EVENTS, eventLabel, formatCents, validateDecisionForm, validateDisputeForm } from "@/lib/payroll/core";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-navy-900 shadow-sm transition focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";

function Notice({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>;
  if (message) return <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{message}</p>;
  return null;
}

/** Partner: dispute one payroll line. */
export function DisputeLineButton({
  ledgerId,
  leadLabel,
  eventType,
  amountCents,
}: {
  ledgerId: string;
  leadLabel: string;
  eventType: string;
  amountCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const bad = validateDisputeForm({ ledgerId, reason, claimedAmount: amount });
    if (bad) return setError(bad);
    setError(null);
    start(async () => {
      const res = await fileDispute({ ledgerId, reason, claimedAmount: amount });
      if (!res.ok) return setError(res.error ?? "Not filed.");
      setOpen(false);
      setReason("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Flag className="h-3.5 w-3.5" /> Dispute
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Dispute this line"
        subtitle={`${leadLabel} · ${eventLabel(eventType)} · shown as ${formatCents(amountCents)}`}
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="dispute-reason" className={labelClass}>
              What is wrong? <span className="text-brick">*</span>
            </label>
            <textarea
              id="dispute-reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. This lead was 45 days old when we set it, so the $250 demo applies."
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="dispute-amount" className={labelClass}>Amount you believe is owed (optional)</label>
            <input id="dispute-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250.00" className={inputClass} />
          </div>
          <Notice error={error} message={null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Filing…" : "File ticket"}</Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

/** Partner: report a lead the week's run never listed. */
export function MissingLeadButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState("");
  const [eventType, setEventType] = useState<string>("");
  const [eventDate, setEventDate] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const form = { lpLeadId: leadId, eventType, eventDate, claimedAmount: amount, reason };
    const bad = validateDisputeForm(form);
    if (bad) return setError(bad);
    setError(null);
    start(async () => {
      const res = await fileDispute(form);
      if (!res.ok) return setError(res.error ?? "Not filed.");
      setOpen(false);
      setLeadId("");
      setEventType("");
      setEventDate("");
      setAmount("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Report a missing lead
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Report a missing lead" subtitle="A lead that should have earned pay but is not on your payroll.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="ml-lead" className={labelClass}>LP lead ID <span className="text-brick">*</span></label>
            <input id="ml-lead" inputMode="numeric" value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="578449" className={inputClass} />
          </div>
          <div>
            <label htmlFor="ml-event" className={labelClass}>What should it have earned? <span className="text-brick">*</span></label>
            <select id="ml-event" value={eventType} onChange={(e) => setEventType(e.target.value)} className={inputClass}>
              <option value="">Choose…</option>
              {DISPUTABLE_EVENTS.map((t) => (
                <option key={t} value={t}>{eventLabel(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ml-date" className={labelClass}>Date it happened <span className="text-brick">*</span></label>
            <input id="ml-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ml-amount" className={labelClass}>Amount owed (optional)</label>
            <input id="ml-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15.00" className={inputClass} />
          </div>
          <div>
            <label htmlFor="ml-reason" className={labelClass}>Details <span className="text-brick">*</span></label>
            <textarea id="ml-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </div>
          <Notice error={error} message={null} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Filing…" : "File ticket"}</Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}

/** Reece approver: approve (with amount) or deny (with a note) one open ticket. */
export function DecideTicket({ disputeId, defaultAmount }: { disputeId: number; defaultAmount: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(defaultAmount);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function act(decision: "approve" | "deny") {
    const bad = validateDecisionForm(decision, note, amount);
    if (bad) return setError(bad);
    setError(null);
    start(async () => {
      const res = await decideDispute({ disputeId, decision, note, approvedAmount: amount });
      if (!res.ok) return setError(res.error ?? "Nothing changed.");
      setMessage(res.message ?? "Done.");
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-500" htmlFor={`amt-${disputeId}`}>Pay $</label>
        <input id={`amt-${disputeId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-28 py-1`} />
        <input aria-label="Note to the partner" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the partner (required to deny)" className={`${inputClass} min-w-0 flex-1 py-1`} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => act("approve")}>Approve</Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => act("deny")}>Deny</Button>
      </div>
      <Notice error={error} message={message} />
    </div>
  );
}
