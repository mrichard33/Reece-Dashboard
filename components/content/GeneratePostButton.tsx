"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Working } from "@/components/ui/Working";
import { generateNow } from "@/lib/actions/content";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Primary, discoverable on-demand generation. A draft is generated automatically
 * each night; this lets an executive add one for a chosen date now.
 *
 * generateNow() blocks until WF1 finishes its whole chain (Anthropic copy + image
 * prompt + image generation + Supabase upload + insert — roughly a minute), so the
 * useTransition `pending` flag, and the spinner gated on it, stays lit for the full
 * run. We refresh the calendar after completion so the finished draft surfaces.
 */
export function GeneratePostButton({ defaultDate }: { defaultDate?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
  const [media, setMedia] = useState<"auto" | "image" | "text">("auto");
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  function generate() {
    setMsg(null);
    startTransition(async () => {
      const res = await generateNow(date, media === "auto" ? undefined : media);
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
        return;
      }
      // Generation runs in the background (the webhook answers { queued: true }
      // immediately) — poll the server so the finished draft surfaces, then report.
      router.refresh();
      for (let i = 0; i < 20; i++) {
        await sleep(5000);
        router.refresh();
      }
      setMsg({
        tone: "info",
        text: res.error ?? `Draft generated for ${date} — check the calendar.`,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Date to generate a post for"
        disabled={pending}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
      />
      <select
        value={media}
        onChange={(e) => setMedia(e.target.value as "auto" | "image" | "text")}
        aria-label="Post media type"
        disabled={pending}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="auto">Auto (settings mix)</option>
        <option value="image">With image</option>
        <option value="text">Text only</option>
      </select>
      <Button variant="primary" size="sm" disabled={pending} onClick={generate}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
        {pending ? "Generating…" : "Generate post"}
      </Button>
      {pending && (
        <Working
          label={
            media === "text"
              ? "Writing copy — text-only posts skip the image (~15s)"
              : "Writing copy & image — up to a minute"
          }
        />
      )}
      {!pending && msg && (
        <span className={msg.tone === "error" ? "text-xs text-rose-600" : "text-xs text-slate-500"}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
