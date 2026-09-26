"use client";

import { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { emailToPlainText } from "@/lib/journey/emailText";
import { cn } from "@/lib/utils";

/**
 * "View email" → a pop-up card with the email as the customer sees it
 * (2026-09-26). The team could only read the stripped text before, which says
 * nothing about layout, images or buttons.
 *
 * The template renders inside `<iframe sandbox="">`: no scripts, no forms, no
 * navigation, so nothing in a template can reach the dashboard. Merge fields
 * such as {{contact.first_name}} show as written — this is the template, not
 * one contact's copy.
 */
export function EmailPreviewButton({
  html,
  subject,
  from,
  className,
}: {
  html: string;
  subject?: string | null;
  from?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"email" | "text">("email");

  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const plain = open && view === "text" ? emailToPlainText(html) : null;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
        <Mail className="h-3.5 w-3.5" /> View email
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Email preview">
          <button
            type="button"
            aria-label="Close email"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-navy-950/50 backdrop-blur-[1px] dark:bg-black/70"
          />
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-[85vh] sm:max-w-[680px] sm:rounded-lg dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-navy-900 dark:text-white">{subject || "(no subject)"}</p>
                {from && <p className="text-xs text-slate-500">From: {from}</p>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-slate-100 px-4 py-2 text-xs dark:border-slate-800">
              {(["email", "text"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium",
                    view === v
                      ? "bg-navy-800 text-white dark:bg-navy-700"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                  )}
                >
                  {v === "email" ? "Email" : "Plain text"}
                </button>
              ))}
            </div>

            {view === "email" ? (
              <iframe title="Email preview" sandbox="" srcDoc={html} className="w-full flex-1 bg-white" />
            ) : (
              <div className="flex-1 overflow-auto p-4 text-sm text-slate-700 dark:text-slate-200">
                {plain?.preheader && <p className="mb-3 text-xs text-slate-500">Inbox preview: {plain.preheader}</p>}
                <p className="whitespace-pre-wrap leading-relaxed">{plain?.text || "(no body stored)"}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
