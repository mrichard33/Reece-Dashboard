"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { lpBrowser } from "@/lib/supabase/lp-browser";
import { updatePassword, type ActionState } from "@/app/login/actions";

const initialState: ActionState = {};

export function ResetPasswordForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(updatePassword, initialState);

  // Supabase appends access_token / refresh_token to the URL fragment on
  // recovery links. The browser client picks them up via detectSessionInUrl,
  // but we explicitly call setSession as a fallback if tokens are present.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = lpBrowser();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setHydrationError(error.message);
        else {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      });
  }, []);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          New password
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          At least 8 characters.
        </p>
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {(state.error || hydrationError) && (
        <p className="text-sm text-rose-600 dark:text-rose-300">
          {state.error ?? hydrationError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
