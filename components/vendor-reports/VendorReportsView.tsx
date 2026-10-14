"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { addVendorReport, saveVendorReport } from "@/lib/actions/vendorReports";
import {
  VDR_MIGRATION,
  deliveryLabel,
  formatEmails,
  lastRunLabel,
  scheduleLabel,
  type VendorItem,
  type VendorReportsPageData,
} from "@/lib/queries/vendorReports.core";

/**
 * /vendor-reports (2026-10-14): one card per lead vendor with the fields a
 * person actually changes (emails, rev share, on/off) and a Save button.
 * Dry run is shown to everyone and switchable by the admin (Mark) only, since
 * it is the one switch that makes a real vendor receive an email.
 * Phone-first: every row wraps, inputs are 16px on phones, no table.
 */

const inputCls =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-300";
const checkCls = "h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-navy-600 dark:border-slate-600 dark:bg-slate-800";

export function VendorReportsView({ data, isAdmin }: { data: VendorReportsPageData; isAdmin: boolean }) {
  if (data.needsMigration) {
    return (
      <Card>
        <CardContent>
          <p className="py-4 text-sm text-slate-600 dark:text-slate-300">
            The vendor tables are not in this database yet. Apply <span className="font-mono">{VDR_MIGRATION}</span> first.
          </p>
        </CardContent>
      </Card>
    );
  }
  const active = data.items.filter((v) => v.is_active);
  const inactive = data.items.filter((v) => !v.is_active);
  return (
    <div className="space-y-6">
      {Object.entries(data.errors).map(([k, msg]) => (
        <p key={k} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Could not read {k}: {msg}
        </p>
      ))}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Sending ({active.length})
        </h2>
        {active.length === 0 && <p className="text-sm text-slate-500">No vendor is switched on.</p>}
        {active.map((v) => <VendorCard key={v.id} vendor={v} isAdmin={isAdmin} />)}
      </section>
      {inactive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Off ({inactive.length})
          </h2>
          <p className="text-xs text-slate-500">
            These rows send nothing. They exist so their LP sub-sources are not listed as &quot;no vendor&quot; in Mark&apos;s weekly summary.
          </p>
          {inactive.map((v) => <VendorCard key={v.id} vendor={v} isAdmin={isAdmin} />)}
        </section>
      )}
      <AddVendorCard />
    </div>
  );
}

function VendorCard({ vendor, isAdmin }: { vendor: VendorItem; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(formatEmails(vendor.recipients_to));
  const [cc, setCc] = useState(formatEmails(vendor.recipients_cc));
  const [revShare, setRevShare] = useState(vendor.rev_share);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const dirty =
    to !== formatEmails(vendor.recipients_to) ||
    cc !== formatEmails(vendor.recipients_cc) ||
    revShare !== vendor.rev_share;

  function save(over: { is_active?: boolean; dry_run?: boolean } = {}) {
    setMsg(null);
    startTransition(async () => {
      const res = await saveVendorReport({
        id: vendor.id,
        recipients_to: to,
        recipients_cc: cc,
        rev_share: revShare,
        is_active: over.is_active ?? vendor.is_active,
        dry_run: over.dry_run ?? vendor.dry_run,
      });
      if (!res.ok) setMsg({ kind: "err", text: res.error ?? "Save failed." });
      else {
        setMsg({ kind: "ok", text: "Saved. The next hourly run uses these settings." });
        router.refresh();
      }
    });
  }

  function toggleActive() {
    const next = !vendor.is_active;
    const q = next
      ? `Turn ON reports for "${vendor.vendor_name}"? ${vendor.dry_run ? "It is in dry run, so the report goes to Mark only." : `It is LIVE: the report goes to ${vendor.recipients_to.join(", ") || "nobody (no email on file)"}.`}`
      : `Turn OFF reports for "${vendor.vendor_name}"? Nothing will be sent until it is turned on again.`;
    if (!window.confirm(q)) return;
    save({ is_active: next });
  }

  function toggleDryRun() {
    const next = !vendor.dry_run;
    const q = next
      ? `Put "${vendor.vendor_name}" back in dry run? Reports go to Mark only.`
      : `Take "${vendor.vendor_name}" LIVE? The next report goes to ${to.trim() || "nobody (add a To email first)"} with Mark in BCC. If this vendor already got a dry-run report this week, it WILL get the live one too.`;
    if (!window.confirm(q)) return;
    save({ dry_run: next });
  }

  return (
    <Card className={vendor.is_active ? "" : "opacity-80"}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{vendor.vendor_name}</CardTitle>
          <p className="mt-0.5 break-words text-[11px] text-slate-400">
            LP sub-sources: {vendor.lp_sub_sources.join(", ")} · {scheduleLabel(vendor)} · last {vendor.lookback_days} days
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={vendor.is_active ? "emerald" : "slate"} dot>{vendor.is_active ? "On" : "Off"}</Badge>
          <Badge tone={vendor.dry_run ? "amber" : "navy"}>{vendor.dry_run ? "Dry run" : "Live"}</Badge>
          {vendor.rev_share && <Badge tone="sky">Rev share</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`to-${vendor.id}`} className={labelCls}>Send to (vendor email)</label>
            <input
              id={`to-${vendor.id}`}
              type="text"
              inputMode="email"
              autoComplete="off"
              className={inputCls}
              placeholder="name@vendor.com, second@vendor.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`cc-${vendor.id}`} className={labelCls}>CC</label>
            <input
              id={`cc-${vendor.id}`}
              type="text"
              inputMode="email"
              autoComplete="off"
              className={inputCls}
              placeholder="optional"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" className={checkCls} checked={revShare} onChange={(e) => setRevShare(e.target.checked)} />
            Rev-share vendor (also gets the weekly Payable Jobs file)
          </label>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          <span className="font-medium text-slate-600 dark:text-slate-300">Next run:</span> {deliveryLabel(vendor)}{" "}
          <span className="font-medium text-slate-600 dark:text-slate-300">Last run:</span> {lastRunLabel(vendor.lastRun)}
        </p>
        {msg && (
          <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.text}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" disabled={pending || !dirty} onClick={() => save()}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" variant={vendor.is_active ? "danger" : "secondary"} disabled={pending} onClick={toggleActive}>
            {vendor.is_active ? "Turn off" : "Turn on"}
          </Button>
          {isAdmin ? (
            <Button size="sm" variant="secondary" disabled={pending} onClick={toggleDryRun}>
              {vendor.dry_run ? "Go live" : "Back to dry run"}
            </Button>
          ) : (
            <span className="text-[11px] text-slate-400">Dry run on/off: Mark only</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddVendorCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subs, setSubs] = useState("");
  const [to, setTo] = useState("");
  const [revShare, setRevShare] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await addVendorReport({ vendor_name: name, lp_sub_sources: subs, recipients_to: to, rev_share: revShare, is_active: true });
      if (!res.ok) setMsg({ kind: "err", text: res.error ?? "Could not add the vendor." });
      else {
        setMsg({ kind: "ok", text: `Added "${name.trim()}" in dry run.` });
        setName(""); setSubs(""); setTo(""); setRevShare(false);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a vendor</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5" /> {open ? "Close" : "New vendor"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nv-name" className={labelCls}>Vendor name</label>
                <input id="nv-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="nv-subs" className={labelCls}>LP sub-source(s), exactly as LP spells them</label>
                <input id="nv-subs" className={inputCls} placeholder="Porch101, Porch101 Sticky" value={subs} onChange={(e) => setSubs(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="nv-to" className={labelCls}>Send to (vendor email)</label>
                <input id="nv-to" className={inputCls} inputMode="email" placeholder="name@vendor.com" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" className={checkCls} checked={revShare} onChange={(e) => setRevShare(e.target.checked)} />
              Rev-share vendor
            </label>
            <p className="text-xs text-slate-500">New vendors start switched on and in dry run (report to Mark only) on Mondays at 9:00 AM ET.</p>
            {msg && (
              <p className={`text-xs ${msg.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.text}</p>
            )}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add vendor"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
