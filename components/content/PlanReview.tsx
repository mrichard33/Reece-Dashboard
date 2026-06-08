"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, SkipForward, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  PLAN_STATUS_META,
  PILLARS,
  ARCHETYPES,
  pillarLabel,
  pillarTone,
  archetypeLabel,
} from "@/components/content/meta";
import { skipPlanSlot, editPlanSlot, generateNow } from "@/lib/actions/content";
import type { FbContentPlan } from "@/lib/supabase/types";

/**
 * Drawer body for a planned (not-yet-generated) calendar slot. Executives can edit the
 * slot's pillar/archetype/campaign, skip it, or generate it now. Mirrors PostReview's
 * in-flight + refresh pattern so the calendar updates live.
 */
export function PlanReview({
  slot,
  isExecutive,
}: {
  slot: FbContentPlan;
  isExecutive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [pillar, setPillar] = useState(slot.pillar);
  const [archetype, setArchetype] = useState(slot.archetype);
  const [campaign, setCampaign] = useState(slot.campaign ?? "");

  const busy = (key: string) => pending && activeKey === key;

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
      else {
        if (okText || res.error) setMsg({ tone: "info", text: res.error ?? okText ?? "" });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PLAN_STATUS_META[slot.status].tone}>{PLAN_STATUS_META[slot.status].label}</Badge>
        <Badge tone={pillarTone(slot.pillar)}>{pillarLabel(slot.pillar)}</Badge>
        <Badge tone="slate">{archetypeLabel(slot.archetype)}</Badge>
        {slot.campaign && (
          <span className="text-xs text-slate-500">arc: {slot.campaign}</span>
        )}
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        This day is planned but not generated yet — no copy or image exists. Generate it into
        the buffer, edit the plan, or skip it.
      </p>

      {editing ? (
        <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Pillar</label>
          <select
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {PILLARS.map((p) => (
              <option key={p} value={p}>
                {pillarLabel(p)}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Archetype</label>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {archetypeLabel(a)}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Campaign (optional)</label>
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="e.g. hurricane-season urgency"
            className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run("edit", async () => {
                  const res = await editPlanSlot(slot.id, { pillar, archetype, campaign });
                  if (res.ok) setEditing(false);
                  return res;
                })
              }
            >
              {busy("edit") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {isExecutive && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(
                "generate",
                () => generateNow(slot.plan_date),
                `Generating a draft for ${slot.plan_date} — it'll appear shortly.`,
              )
            }
          >
            {busy("generate") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}{" "}
            Generate now
          </Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setEditing((v) => !v)}>
            <Pencil className="h-3.5 w-3.5" /> {editing ? "Editing…" : "Edit slot"}
          </Button>
          {slot.status !== "skipped" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("skip", () => skipPlanSlot(slot.id))}>
              {busy("skip") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />} Skip
            </Button>
          )}
        </div>
      )}

      {msg && (
        <p className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
