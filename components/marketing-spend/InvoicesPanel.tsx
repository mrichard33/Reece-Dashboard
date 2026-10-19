import Link from "next/link";
import type { Route } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { InfoPopover } from "@/components/help/InfoPopover";
import { usdExact, shortDate } from "@/lib/utils";
import type { InvoiceDoc } from "@/lib/queries/marketingCost.core";

const TONE: Record<string, BadgeTone> = { Posted: "emerald", "In review": "amber", Rejected: "slate", Failed: "rose" };

/**
 * Invoices tab of /marketing-spend (moved from Scorecard › Sources on
 * 2026-10-19): every invoice the ledger has seen, newest first, with a plain
 * status (In review / Posted / Rejected / Failed), vendor, total, a link to
 * the original file and the extracted text. Rejected ones (a duplicate, a
 * mistake) are hidden until "Show rejected". Server component; the file link
 * goes through /api/marketing-invoice/[id] so the signed URL is minted per
 * click, never stored.
 */
export function InvoicesPanel({
  docs,
  needsMigration,
  showRejected,
  hiddenRejected,
  toggleHref,
}: {
  docs: InvoiceDoc[];
  needsMigration: boolean;
  showRejected: boolean;
  hiddenRejected: number;
  toggleHref: Route;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <h3 className="font-display text-base font-semibold text-navy-900 dark:text-white">Invoices</h3>
          <InfoPopover helpKey="scorecard.invoices" />
          <span className="text-xs text-slate-400">marketing-invoices@ inbox → text extraction → review in Slack</span>
        </div>
        {(showRejected || hiddenRejected > 0) && (
          <Link
            href={toggleHref}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7"
          >
            {showRejected ? "Hide rejected" : `Show rejected (${hiddenRejected})`}
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {needsMigration && (
          <p className="text-xs text-amber-800 dark:text-amber-300">The ledger is not in this database yet (LP-MCP sql/158).</p>
        )}
        {!needsMigration && docs.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No invoices yet. Forward one to the marketing-invoices inbox.</p>
        )}
        <div className="space-y-2">
          {docs.map((d) => (
            <details key={d.id} className="rounded-lg border border-slate-200 px-3.5 py-3 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge tone={TONE[d.status_label] ?? "amber"}>{d.status_label}</Badge>
                  <span className="text-[13.5px] font-medium text-slate-800 dark:text-slate-100">{d.vendor}</span>
                  <span className="text-xs text-slate-500">#{d.invoice_number} · {d.period}</span>
                </span>
                <span className="font-mono text-[13px] tabular text-slate-900 dark:text-slate-100">{d.total == null ? "—" : usdExact(d.total)}</span>
              </summary>
              <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <div className="break-words">From {d.from} · {d.received_at ? shortDate(d.received_at) : "—"} · {d.file_name} · analyzer {d.analyzer}</div>
                {d.flags.length > 0 && <div>Flags: {d.flags.join(", ")}</div>}
                {d.has_file && (
                  <a href={`/api/marketing-invoice/${d.id}`} className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900 sm:h-7" target="_blank" rel="noopener">
                    Open original file
                  </a>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[12px] font-medium text-slate-600 dark:text-slate-300">Extracted text</summary>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[11px] text-slate-700 dark:bg-slate-950 dark:text-slate-300">{d.extracted_text || "(empty)"}</pre>
                </details>
              </div>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
