"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { saveMessageBank, savePrompt, runStrategicRefresh } from "@/lib/actions/content";
import type { FbMessageBank, FbMessagingPrompt } from "@/lib/supabase/types";

type Result = { ok: boolean; error?: string };

export function MessageBankEditor({
  bank,
  prompts,
  isAdmin,
}: {
  bank: FbMessageBank | null;
  prompts: FbMessagingPrompt[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [json, setJson] = useState(bank ? JSON.stringify(bank.variables, null, 2) : "");
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  function run(fn: () => Promise<Result>, ok?: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        if (ok) setMsg({ tone: "info", text: ok });
        router.refresh();
      }
    });
  }

  function saveBank() {
    if (!bank) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setMsg({ tone: "error", text: "Message bank must be valid JSON." });
      return;
    }
    run(() => saveMessageBank(bank.id, parsed), "Message bank saved.");
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => runStrategicRefresh(), "Strategic refresh queued.")}
          >
            <Wand2 className="h-3.5 w-3.5" /> Run Strategic Refresh
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Message Bank</CardTitle>
        </CardHeader>
        <CardContent>
          {!bank ? (
            <p className="text-sm text-slate-500">No active message bank. Apply the 0004 seed migration.</p>
          ) : (
            <div className="space-y-2">
              <textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                readOnly={!isAdmin}
                rows={18}
                className="block w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                spellCheck={false}
              />
              {isAdmin && (
                <Button size="sm" disabled={pending} onClick={saveBank}>
                  Save message bank
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt templates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {prompts.map((p) => (
              <PromptEditor key={p.id} prompt={p} isAdmin={isAdmin} pending={pending} run={run} />
            ))}
            {prompts.length === 0 && (
              <p className="text-sm text-slate-500">No prompts. Apply the 0004 seed migration.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {msg && (
        <p className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

function PromptEditor({
  prompt,
  isAdmin,
  pending,
  run,
}: {
  prompt: FbMessagingPrompt;
  isAdmin: boolean;
  pending: boolean;
  run: (fn: () => Promise<Result>, ok?: string) => void;
}) {
  const [body, setBody] = useState(prompt.body);
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <p className="mb-1 font-mono text-xs font-semibold text-navy-800 dark:text-slate-200">
        {prompt.name} <span className="font-normal text-slate-400">v{prompt.version}</span>
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={!isAdmin}
        rows={6}
        className="block w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
        spellCheck={false}
      />
      {isAdmin && (
        <Button
          size="sm"
          className="mt-2"
          disabled={pending}
          onClick={() => run(() => savePrompt(prompt.id, body), `Saved ${prompt.name}.`)}
        >
          Save
        </Button>
      )}
    </div>
  );
}
