"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/Button";
import { Working } from "@/components/ui/Working";
import { generateNow } from "@/lib/actions/content";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Primary, discoverable on-demand generation. A draft is generated automatically
 * each night; this lets an executive add one for a chosen date now.
 *
 * LAYOUT (2026-08-24): the date input and media select used to sit loose in the
 * calendar toolbar, where they read as filters on the calendar rather than as
 * arguments to this button. They now open in a small panel under the button, so the
 * toolbar carries one control instead of three and the inputs are visibly attached to
 * the action they belong to.
 *
 * generateNow() returns as soon as WF1 accepts the webhook, but the work (Anthropic
 * copy + image prompt + image generation + Supabase upload + insert) runs for roughly
 * a minute afterwards, so we keep the transition pending and poll the calendar until
 * the finished draft surfaces.
 */
export function GeneratePostButton({ defaultDate }: { defaultDate?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate ?? format(new Date(), "yyyy-MM-dd"));
  const [media, setMedia] = useState<"auto" | "image" | "text">("auto");
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape — never while a run is in flight, so the progress
  // line can't vanish mid-generation.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (pending) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, pending]);

  function generate() {
    setMsg(null);
    startTransition(async () => {
      const res = await generateNow(date, media === "auto" ? undefined : media);
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error ?? "Something went wrong." });
        return;
      }
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

  const inputCls =
    "w-full rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="relative" ref={wrapRef}>
      <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}{" "}
        {pending ? "Generating…" : "Generate post"}
        <ChevronDown className="ml-0.5 h-3 w-3 opacity-70" />
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            Adds one draft for a chosen day, on top of the nightly one.
          </p>

          <label className="mb-0.5 block text-[11px] text-slate-600 dark:text-slate-300">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date to generate a post for"
            disabled={pending}
            className={`mb-2 ${inputCls}`}
          />

          <label className="mb-0.5 block text-[11px] text-slate-600 dark:text-slate-300">
            Media
          </label>
          <select
            value={media}
            onChange={(e) => setMedia(e.target.value as "auto" | "image" | "text")}
            aria-label="Post media type"
            disabled={pending}
            className={`mb-2.5 ${inputCls}`}
          >
            <option value="auto">Auto (settings mix)</option>
            <option value="image">With image</option>
            <option value="text">Text only</option>
          </select>

          <Button variant="primary" size="sm" disabled={pending} onClick={generate}>
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}{" "}
            {pending ? "Generating…" : "Generate now"}
          </Button>

          {pending && (
            <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              <Working
                label={
                  media === "text"
                    ? "Writing copy — text-only posts skip the image (~15s)"
                    : "Writing copy & image — up to a minute"
                }
              />
            </div>
          )}
          {!pending && msg && (
            <p
              className={`mt-2.5 border-t border-slate-100 pt-2 text-[11px] dark:border-slate-800 ${
                msg.tone === "error" ? "text-rose-600" : "text-slate-500"
              }`}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
