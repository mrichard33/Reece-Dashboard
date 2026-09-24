"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { WorkflowContactRow, WorkflowContactsPage } from "@/lib/queries/workflowDetail";
import { formatPhone } from "@/lib/journey/normalize";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { etShort, relTime } from "@/lib/utils";

/** Contacts in the workflow now; loads from /api/workflows/[id]/contacts. */
export function ActiveLeadsTable({ ghlWorkflowId }: { ghlWorkflowId: string }) {
  const [rows, setRows] = useState<WorkflowContactRow[] | null>(null);
  const [cursor, setCursor] = useState<WorkflowContactsPage["nextCursor"]>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fetchPage(c: WorkflowContactsPage["nextCursor"]) {
    const sp = new URLSearchParams();
    if (c) {
      sp.set("cursorDate", c.d);
      sp.set("cursorId", c.id);
    }
    return fetch(`/api/workflows/${ghlWorkflowId}/contacts?${sp}`, { cache: "no-store" }).then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as WorkflowContactsPage & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    });
  }

  useEffect(() => {
    let alive = true;
    fetchPage(null)
      .then((p) => {
        if (!alive) return;
        setRows(p.rows);
        setCursor(p.nextCursor);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not reach the dashboard server."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghlWorkflowId]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const p = await fetchPage(cursor);
      setRows((prev) => [...(prev ?? []), ...p.rows]);
      setCursor(p.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the dashboard server.");
    } finally {
      setLoading(false);
    }
  }

  if (error) return <p className="py-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>;
  if (!rows)
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-500">Nobody is in this workflow right now.</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-3">Lead</th>
              <th className="py-2 pr-3">Entered workflow</th>
              <th className="py-2 pr-3">Position</th>
              <th className="py-2 pr-3">Next send</th>
              <th className="py-2 pr-3">Last change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.ghlContactId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="py-2 pr-3">
                  <Link href={`/leads/${r.ghlContactId}` as Route} className="font-medium text-navy-900 hover:underline dark:text-white">
                    {r.name}
                  </Link>
                  <div className="text-xs text-slate-500">{formatPhone(r.phone) ?? "—"}</div>
                </td>
                <td className="py-2 pr-3 text-xs tabular-nums">{r.enteredAt ? `${etShort(r.enteredAt)} ET` : <span className="text-slate-400">—</span>}</td>
                <td className="py-2 pr-3 text-xs">{r.position}</td>
                <td className="py-2 pr-3 text-xs">
                  {r.next ? (
                    <>
                      <span className="tabular-nums">{etShort(r.next.ts)} ET</span>
                      <div className="italic text-slate-500">{r.next.title}</div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-500">{relTime(r.lastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="pt-3 text-center">
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
