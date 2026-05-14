"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { lpBrowser } from "@/lib/supabase/lp-browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/overview";
  const errParam = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrMsg(null);

    const supabase = lpBrowser();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(from)}`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      setStatus("error");
      setErrMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <p className="font-medium">Check your email.</p>
        <p className="mt-1 text-emerald-800 dark:text-emerald-200">
          We sent a magic link to <strong>{email}</strong>. Click it to sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@reecewindows.com"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {(errMsg || errParam) && (
        <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {errMsg ?? errParam}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "sending" ? "Sending link…" : "Send magic link"}
      </button>
    </form>
  );
}
