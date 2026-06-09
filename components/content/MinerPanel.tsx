"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Pencil, Sparkles, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PILLARS, pillarLabel, pillarTone } from "@/components/content/meta";
import { relTime } from "@/lib/utils";
import {
  approveSubtopic,
  rejectSubtopic,
  editAndApproveSubtopic,
  addSubtopic,
  toggleSubtopicActive,
  runMiner,
} from "@/lib/actions/content";
import type { FbSubtopic } from "@/lib/supabase/types";

type Result = { ok: boolean; error?: string };

export function MinerPanel({
  proposals,
  subtopics,
  coverage,
  isExecutive,
}: {
  proposals: FbSubtopic[];
  subtopics: FbSubtopic[];
  coverage: { pillar: string; count: number }[];
  isExecutive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<Result>, after?: () => void) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErr(res.error ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {proposals.length} proposal{proposals.length === 1 ? "" : "s"} awaiting review
        </p>
        {isExecutive && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => runMiner())}>
            <Sparkles className="h-3.5 w-3.5" /> Run miner now
          </Button>
        )}
      </div>

      {err && <p className="text-xs text-rose-600">{err}</p>}

      {/* Proposals */}
      <Card>
        <CardHeader>
          <CardTitle>Proposals</CardTitle>
        </CardHeader>
        <CardContent>
          {proposals.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No proposals right now. Run the miner to mine customer questions for new ideas.
            </p>
          ) : (
            <ul className="space-y-3">
              {proposals.map((p) => (
                <ProposalRow
                  key={p.id}
                  proposal={p}
                  isExecutive={isExecutive}
                  pending={pending}
                  run={run}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Coverage strip */}
      <Card>
        <CardHeader>
          <CardTitle>Active subtopic coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {coverage.map((c) => (
              <div key={c.pillar} className="rounded-md border border-slate-200 p-2 text-center dark:border-slate-800">
                <p className="text-lg font-semibold text-navy-900 dark:text-white">{c.count}</p>
                <p className="text-[11px] text-slate-500">{pillarLabel(c.pillar)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subtopic bank */}
      <Card>
        <CardHeader>
          <CardTitle>Subtopic bank</CardTitle>
        </CardHeader>
        <CardContent>
          {isExecutive && <AddSubtopicForm pending={pending} run={run} />}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-2">Subtopic</th>
                  <th className="px-2">Pillar</th>
                  <th className="px-2">Used</th>
                  <th className="px-2">Last used</th>
                  <th className="px-2">Status</th>
                  {isExecutive && <th className="px-2">Active</th>}
                </tr>
              </thead>
              <tbody>
                {subtopics.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-2">{s.subtopic}</td>
                    <td className="px-2">
                      <Badge tone={pillarTone(s.pillar)}>{pillarLabel(s.pillar)}</Badge>
                    </td>
                    <td className="px-2 text-slate-500">{s.times_used}</td>
                    <td className="px-2 text-slate-500">{s.last_used_at ? relTime(s.last_used_at) : "—"}</td>
                    <td className="px-2 text-slate-500">{s.status}</td>
                    {isExecutive && (
                      <td className="px-2">
                        <input
                          type="checkbox"
                          checked={s.status === "active"}
                          disabled={pending}
                          onChange={(e) => run(() => toggleSubtopicActive(s.id, e.target.checked))}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProposalRow({
  proposal,
  isExecutive,
  pending,
  run,
}: {
  proposal: FbSubtopic;
  isExecutive: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [subtopic, setSubtopic] = useState(proposal.subtopic);
  const [pillar, setPillar] = useState(proposal.pillar);

  return (
    <li className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={subtopic}
                onChange={(e) => setSubtopic(e.target.value)}
                className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <select
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {PILLARS.map((p) => (
                  <option key={p} value={p}>
                    {pillarLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex items-start gap-1.5 text-left"
              >
                {expanded ? (
                  <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                )}
                <span className="text-sm font-medium text-navy-900 hover:underline dark:text-slate-100">
                  {proposal.subtopic}
                </span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 pl-5">
                <Badge tone={pillarTone(proposal.pillar)}>{pillarLabel(proposal.pillar)}</Badge>
                {proposal.buyer_stage && (
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {proposal.buyer_stage}
                  </span>
                )}
                {!expanded && proposal.answers_question && (
                  <span className="truncate text-xs text-slate-500">{proposal.answers_question}</span>
                )}
              </div>

              {expanded && (
                <dl className="mt-2 space-y-1 border-t border-slate-100 pl-5 pt-2 text-xs dark:border-slate-800">
                  <Detail label="Answers" value={proposal.answers_question ?? "—"} />
                  <Detail label="Evidence" value={proposal.source_evidence ?? "—"} />
                  <Detail label="Buyer stage" value={proposal.buyer_stage ?? "—"} />
                  <Detail label="Source" value={proposal.source} />
                  <Detail label="Times used" value={String(proposal.times_used)} />
                  <Detail label="Last used" value={proposal.last_used_at ? relTime(proposal.last_used_at) : "—"} />
                  <Detail label="Proposed" value={relTime(proposal.created_at)} />
                  <Detail label="Status" value={proposal.status} />
                </dl>
              )}
            </>
          )}
        </div>

        {isExecutive && (
          <div className="flex flex-shrink-0 gap-1">
            {editing ? (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => editAndApproveSubtopic(proposal.id, { subtopic, pillar }),
                      () => setEditing(false),
                    )
                  }
                >
                  Save &amp; approve
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={pending} onClick={() => run(() => approveSubtopic(proposal.id))}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => rejectSubtopic(proposal.id))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 flex-shrink-0 text-slate-400">{label}</dt>
      <dd className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{value}</dd>
    </div>
  );
}

function AddSubtopicForm({
  pending,
  run,
}: {
  pending: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
}) {
  const [subtopic, setSubtopic] = useState("");
  const [pillar, setPillar] = useState<string>(PILLARS[0] ?? "storm");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={subtopic}
        onChange={(e) => setSubtopic(e.target.value)}
        placeholder="Add a subtopic"
        className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      <select
        value={pillar}
        onChange={(e) => setPillar(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {PILLARS.map((p) => (
          <option key={p} value={p}>
            {pillarLabel(p)}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={pending || !subtopic.trim()}
        onClick={() => run(() => addSubtopic({ subtopic, pillar }), () => setSubtopic(""))}
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
