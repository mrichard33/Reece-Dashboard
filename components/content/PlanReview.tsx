"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, SkipForward, Loader2, Sparkles, Compass, ClipboardCheck } from "lucide-react";
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
import {
  skipPlanSlot,
  editPlanSlot,
  generateNow,
  runStrategist,
  approveContentBrief,
} from "@/lib/actions/content";
import { getSubtopicDetail } from "@/lib/actions/getSubtopic";
import type { FbContentPlan, FbSubtopic } from "@/lib/supabase/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drawer body for a planned (not-yet-generated) calendar slot. Executives can edit the
 * slot's pillar/archetype/campaign, skip it, or generate it now. Mirrors PostReview's
 * in-flight + refresh pattern so the calendar updates live.
 *
 * On open it resolves the slot's linked subtopic so the day shows what it will actually
 * cover (topic, the question it answers, evidence, buyer stage) before generation. When a
 * Strategist Content Brief exists it's shown here for review + approval; the generator
 * only consumes an APPROVED brief.
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
  // Media choice for "Generate now": auto = WF1's settings-driven text/image mix.
  const [genMedia, setGenMedia] = useState<"auto" | "image" | "text">("auto");

  // Resolve the linked subtopic for the "what this day covers" detail.
  const [sub, setSub] = useState<FbSubtopic | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!slot.subtopic_id) {
      setSub(null);
      return;
    }
    setSubLoading(true);
    getSubtopicDetail(slot.subtopic_id)
      .then((s) => {
        if (active) setSub(s);
      })
      .finally(() => {
        if (active) setSubLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slot.subtopic_id]);

  const busy = (key: string) => pending && activeKey === key;
  const brief = slot.brief;

  // When the Strategist's brief lands (a router.refresh() delivers fresh slot props),
  // swap the "running…" message for a done note so the click visibly completed.
  useEffect(() => {
    if (slot.brief_status !== "none") {
      setMsg((m) =>
        m?.text.startsWith("Strategist running")
          ? { tone: "info", text: "Brief ready — review it below." }
          : m,
      );
    }
  }, [slot.brief_status]);

  // pollSeconds > 0 keeps refreshing after the action returns — used for Run Strategist,
  // whose brief lands asynchronously (n8n upserts it a few seconds later).
  function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okText?: string,
    pollSeconds = 0,
  ) {
    setMsg(null);
    setActiveKey(key);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
        return;
      }
      if (okText || res.error) setMsg({ tone: "info", text: res.error ?? okText ?? "" });
      router.refresh();
      const ticks = Math.ceil(pollSeconds / 5);
      for (let i = 0; i < ticks; i++) {
        await sleep(5000);
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
        {slot.brief_status !== "none" && (
          <Badge tone={slot.brief_status === "approved" ? "emerald" : "amber"}>
            Brief {slot.brief_status}
          </Badge>
        )}
        {slot.campaign && <span className="text-xs text-slate-500">arc: {slot.campaign}</span>}
      </div>

      <p className="text-xs text-slate-500">
        {pillarLabel(slot.pillar)} pillar · {archetypeLabel(slot.archetype)} angle
        {slot.campaign ? ` · part of the “${slot.campaign}” arc` : ""}.
      </p>

      {/* Strategist Content Brief (review + approve; the generator consumes it only once approved) */}
      {slot.brief_status !== "none" && brief ? (
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Content Brief
            </p>
            <Badge tone={slot.brief_status === "approved" ? "emerald" : "amber"}>
              {slot.brief_status === "approved" ? "Approved" : "Draft"}
            </Badge>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            {brief.post_strategy && (
              <p>
                <span className="font-medium">Strategy:</span> {brief.post_strategy}
              </p>
            )}
            {brief.caption_direction && (
              <p>
                <span className="font-medium">Angle:</span> {brief.caption_direction}
              </p>
            )}
            {brief.recommended_cta && (
              <p>
                <span className="font-medium">CTA:</span> {brief.recommended_cta}
              </p>
            )}
            {(brief.recommended_format || brief.funnel_stage || brief.buyer_objective) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {brief.recommended_format && <span>format: {brief.recommended_format}</span>}
                {brief.funnel_stage && <span>stage: {brief.funnel_stage}</span>}
                {brief.buyer_objective && <span>objective: {brief.buyer_objective}</span>}
              </div>
            )}
            {brief.image_concept && (
              <p>
                <span className="font-medium">Image:</span> {brief.image_concept}
              </p>
            )}
            {brief.video_concept && (
              <p>
                <span className="font-medium">Video:</span> {brief.video_concept}
              </p>
            )}
            {brief.why_it_works && (
              <p className="border-l-2 border-slate-200 pl-2 italic dark:border-slate-700">
                {brief.why_it_works}
              </p>
            )}
            {brief.data_insight_trigger && (
              <p className="text-[11px] text-slate-400">Trigger: {brief.data_insight_trigger}</p>
            )}
          </div>
          {isExecutive && slot.brief_status === "draft" && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() =>
                  run(
                    "approve-brief",
                    () => approveContentBrief(slot.id),
                    "Brief approved — the generator will use it.",
                  )
                }
              >
                {busy("approve-brief") ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-3.5 w-3.5" />
                )}{" "}
                Approve brief
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* What this day will cover (the planned subtopic) */}
      {slot.subtopic_id ? (
        <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Planned topic
          </p>
          {subLoading ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : sub ? (
            <div className="mt-1 space-y-2">
              <p className="text-sm font-medium text-navy-900 dark:text-slate-100">{sub.subtopic}</p>
              {sub.answers_question && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Answers:</span> {sub.answers_question}
                </p>
              )}
              {sub.source_evidence && (
                <p className="border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500 dark:border-slate-700">
                  {sub.source_evidence}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                {sub.buyer_stage && <span>buyer stage: {sub.buyer_stage}</span>}
                <span>used {sub.times_used}×</span>
                <span>source: {sub.source}</span>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Couldn’t load the linked subtopic.</p>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700">
          No specific subtopic is linked to this day — the generator will choose one that fits the{" "}
          {pillarLabel(slot.pillar)} pillar.
        </div>
      )}

      <p className="text-sm text-slate-600 dark:text-slate-300">
        Not generated yet — no copy or image exists. Run the Strategist for a data-driven brief,
        generate it into the buffer, edit the plan, or skip it.
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
                "strategist",
                () => runStrategist(slot.plan_date),
                `Strategist running for ${slot.plan_date} — takes about a minute; the brief will appear below.`,
                90,
              )
            }
          >
            {busy("strategist") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Compass className="h-3.5 w-3.5" />
            )}{" "}
            {slot.brief_status === "none" ? "Run Strategist" : "Re-run Strategist"}
          </Button>
          <span className="inline-flex items-center gap-1">
          <select
            value={genMedia}
            onChange={(e) => setGenMedia(e.target.value as "auto" | "image" | "text")}
            aria-label="Media type for Generate now"
            disabled={pending}
            className="rounded-md border border-slate-300 px-1.5 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="auto">Auto</option>
            <option value="image">With image</option>
            <option value="text">Text only</option>
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(
                "generate",
                () => generateNow(slot.plan_date, genMedia === "auto" ? undefined : genMedia),
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
          </span>
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
