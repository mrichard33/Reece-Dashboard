"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/botReview/leadStatus";

/**
 * Lead status — can the bot, and Reece, still reach this person (2026-10-06)?
 *
 * Read from the contact's current GHL tags through the canonical lists in
 * lib/botReview/contactTags.ts (copied from LP MCP's send gates). Display
 * only: nothing here changes a tag.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-semibold text-navy-900 dark:text-white">{children}</dd>
    </div>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
          : "bg-brick-700 text-white dark:bg-brick-600",
      )}
    >
      {children}
    </span>
  );
}

export function LeadStatusCard({
  status,
  prospectId,
  leadId,
}: {
  status: LeadStatus;
  prospectId: string | null;
  leadId: string | null;
}) {
  const [showTags, setShowTags] = useState(false);

  return (
    <section
      aria-label="Lead status"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="text-sm font-semibold text-navy-900 dark:text-white">Lead status</h2>

      {!status.known && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          The GHL contact could not be read, so these are not known right now.
        </p>
      )}

      {status.warning && (
        <p
          role="note"
          className="mt-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800"
        >
          {status.warning}
        </p>
      )}

      <dl className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        <Row label="Bot">
          <Pill ok={status.bot === "Active"}>{status.bot}</Pill>
        </Row>
        <Row label="Service area">
          <Pill ok={status.serviceArea.label === "In area"}>
            {status.serviceArea.label}
            {status.serviceArea.zip ? ` · ${status.serviceArea.zip}` : ""}
          </Pill>
        </Row>
      </dl>

      <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Can we reach them?</p>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        {status.reach.map((r) => (
          <Row key={r.channel} label={r.channel}>
            <Pill ok={r.allowed}>{r.allowed ? "Allowed" : "Opted out"}</Pill>
          </Row>
        ))}
      </dl>

      <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">Job</p>
      <dl className="divide-y divide-slate-100 dark:divide-slate-800">
        <Row label="Estimate status">{status.job.estimateStatus ?? "—"}</Row>
        <Row label="LP market">{status.job.market ?? "—"}</Row>
        <Row label="Source">
          <span className="break-words">{status.job.source ?? "—"}</span>
        </Row>
        <Row label="Prospect">
          <span className="font-mono">{prospectId ?? "—"}</span>
        </Row>
        <Row label="LP lead">
          <span className="font-mono">{leadId ?? "—"}</span>
        </Row>
      </dl>

      {status.tags.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={showTags}
            onClick={() => setShowTags((v) => !v)}
            className="py-1 text-xs font-medium text-navy-700 hover:underline dark:text-navy-200"
          >
            {showTags ? "Hide tags" : `Show all tags (${status.tags.length})`}
          </button>
          {showTags && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {status.tags.map((t) => (
                <li
                  key={t}
                  className="break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
