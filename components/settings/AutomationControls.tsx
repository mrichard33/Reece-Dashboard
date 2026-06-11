"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/StatusDot";
import { mcpErrorPresentation } from "@/components/tiles/McpStatusTile";
import {
  toggleFbWorkflow,
  type FbWorkflowsResult,
  type FbWorkflowRow,
} from "@/lib/actions/settings";

export function AutomationControls({ initial }: { initial: FbWorkflowsResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automation Controls</CardTitle>
        <Badge tone="slate">FB content engine</Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-slate-500">
          Activate or deactivate the FB content-engine workflows. GHL and agentic workflows
          are intentionally not shown here — flip those from a chat session with full context.
        </p>

        {!initial.ok ? (
          <FailureNotice kind={initial.kind} message={initial.message} />
        ) : initial.workflows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No <span className="font-mono">FB ·</span> workflows found.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {initial.workflows.map((w) => (
              <WorkflowRow key={w.id} workflow={w} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WorkflowRow({ workflow }: { workflow: FbWorkflowRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toggle() {
    const next = !workflow.active;
    const consequence = next
      ? `Activate "${workflow.name}"? It will start running on its trigger.`
      : `Deactivate "${workflow.name}"? It will stop running on its trigger.`;
    if (!window.confirm(consequence)) return;
    setErr(null);
    startTransition(async () => {
      const res = await toggleFbWorkflow(workflow.id, next);
      if (!res.ok) setErr(res.error ?? "Toggle failed.");
      else router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-navy-900 dark:text-slate-100">
          {workflow.name}
        </p>
        <p className="text-[11px] text-slate-400">
          {workflow.nodeCount !== null ? `${workflow.nodeCount} nodes · ` : ""}
          {workflow.active ? "Active" : "Inactive"}
        </p>
        {err && <p className="mt-0.5 text-[11px] text-rose-600">{err}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={workflow.active ? "emerald" : "slate"} dot>
          {workflow.active ? "On" : "Off"}
        </Badge>
        <Button
          size="sm"
          variant={workflow.active ? "danger" : "primary"}
          disabled={pending}
          onClick={toggle}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : workflow.active ? (
            "Deactivate"
          ) : (
            "Activate"
          )}
        </Button>
      </div>
    </li>
  );
}

function FailureNotice({ kind, message }: { kind: string; message: string }) {
  const { dot, tone, heading } = mcpErrorPresentation(
    (kind as Parameters<typeof mcpErrorPresentation>[0]) ?? "unknown",
  );
  return (
    <div className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <StatusDot status={dot} animate={false} />
      <div>
        <Badge tone={tone}>{heading}</Badge>
        <p className="mt-1 break-words text-[11px] text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </div>
  );
}
