"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { saveFbTuning } from "@/lib/actions/settings";
import type { FbTuning, TuningFieldInfo, TuningKey } from "@/lib/queries/content";

const FIELD_LABELS: Record<TuningKey, { label: string; help: string; min: number; max: number }> = {
  max_regen_attempts: {
    label: "Max regen attempts",
    help: "Rejections before a slot is flagged for manual authoring (1–10).",
    min: 1,
    max: 10,
  },
  max_per_generation: {
    label: "Max per generation",
    help: "Hard cap on drafts one batch fill may create (1–20).",
    min: 1,
    max: 20,
  },
  plan_horizon_days: {
    label: "Plan horizon (days)",
    help: 'Default window for "Plan next N days" (1–90).',
    min: 1,
    max: 90,
  },
  generation_buffer_days: {
    label: "Generation buffer (days)",
    help: "Lead time WF1 keeps drafts ahead of schedule (1–30).",
    min: 1,
    max: 30,
  },
  video_share: {
    label: "Video share (%)",
    help: "Target share of posts that should be video (0–100). Consumed once video generation is wired.",
    min: 0,
    max: 100,
  },
  mascot_frequency: {
    label: "Mascot frequency (%)",
    help: "Of video posts, the share that use the mascot (0–100). Consumed once video generation is wired.",
    min: 0,
    max: 100,
  },
  text_share: {
    label: "Text-only share (%)",
    help: "Share of auto-generated posts that ship as text with no image (0–100). 25 ≈ one in four.",
    min: 0,
    max: 100,
  },
};

function sourceBadge(f: TuningFieldInfo) {
  if (f.source === "db") return <Badge tone="emerald">DB</Badge>;
  return <Badge tone="slate">env fallback ({f.envFallback})</Badge>;
}

export function TuningCard({
  tuning,
  isAdmin,
}: {
  tuning: FbTuning;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  // String-backed inputs; "" = clear to env/default fallback.
  const initialNums = Object.fromEntries(
    tuning.fields.map((f) => [f.key, f.dbValue?.toString() ?? ""]),
  ) as Record<TuningKey, string>;
  const [nums, setNums] = useState<Record<TuningKey, string>>(initialNums);
  const [postTime, setPostTime] = useState(tuning.defaultPostTime ?? "");

  function save() {
    setMsg(null);
    startTransition(async () => {
      const input: Parameters<typeof saveFbTuning>[0] = {
        default_post_time: postTime.trim() === "" ? null : postTime.trim(),
      };
      for (const key of Object.keys(nums) as TuningKey[]) {
        const raw = nums[key].trim();
        input[key] = raw === "" ? null : Number(raw);
      }
      const res = await saveFbTuning(input);
      if (!res.ok) setMsg({ tone: "error", text: res.error ?? "Save failed." });
      else {
        setMsg({ tone: "info", text: "Tuning saved." });
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation Tuning</CardTitle>
        {!isAdmin && <Badge tone="slate">Read-only</Badge>}
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-slate-500">
          Primary values for the content engine. Leave a field blank to fall back to the
          environment variable, then the built-in default.
        </p>

        <div className="space-y-4">
          {tuning.fields.map((f) => {
            const meta = FIELD_LABELS[f.key];
            return (
              <div key={f.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {meta.label}
                  </label>
                  {sourceBadge(f)}
                </div>
                <input
                  type="number"
                  min={meta.min}
                  max={meta.max}
                  value={nums[f.key]}
                  onChange={(e) => setNums((n) => ({ ...n, [f.key]: e.target.value }))}
                  disabled={!isAdmin}
                  placeholder={`fallback ${f.envFallback}`}
                  className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <p className="text-[11px] text-slate-400">
                  {meta.help} Effective: <span className="font-medium">{f.value}</span>
                </p>
              </div>
            );
          })}

          {/* Default post time */}
          <div className="space-y-1 border-t border-slate-100 pt-4 dark:border-slate-800">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Default post time (Eastern)
            </label>
            <input
              type="time"
              value={postTime}
              onChange={(e) => setPostTime(e.target.value)}
              disabled={!isAdmin}
              className="block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="text-[11px] text-slate-400">
              With a default set, a post with no per-post time publishes at this time (Eastern).
              Clear it to publish such posts the moment they&apos;re approved.
            </p>
          </div>

          {isAdmin && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={save}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Save tuning
            </Button>
          )}

          {msg && (
            <p className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-emerald-600"}>
              {msg.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
