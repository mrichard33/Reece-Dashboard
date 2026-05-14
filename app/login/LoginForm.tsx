"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import {
  signIn,
  requestPasswordReset,
  type ActionState,
} from "./actions";

type Mode = "signin" | "reset";

const initialState: ActionState = {};

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    initialState,
  );
  const searchParams = useSearchParams();
  const errParam = searchParams.get("error");

  if (mode === "reset") {
    if (resetState.success) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <p className="font-medium">Check your email.</p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-200">
              If an account exists, we sent a link to set your password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="text-xs font-medium text-navy-700 hover:underline dark:text-navy-300"
          >
            ← Back to sign in
          </button>
        </div>
      );
    }

    return (
      <form action={resetAction} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@reecewindows.com"
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {resetState.error && (
          <p className="text-sm text-rose-600 dark:text-rose-300">
            {resetState.error}
          </p>
        )}

        <button
          type="submit"
          disabled={resetPending}
          className="w-full rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resetPending ? "Sending…" : "Send password setup link"}
        </button>

        <button
          type="button"
          onClick={() => setMode("signin")}
          className="block w-full text-center text-xs font-medium text-navy-700 hover:underline dark:text-navy-300"
        >
          ← Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form action={signInAction} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@reecewindows.com"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-navy-600 focus:outline-none focus:ring-1 focus:ring-navy-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Password
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
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
      </div>

      {(signInState.error || errParam) && (
        <p className="text-sm text-rose-600 dark:text-rose-300">
          {signInState.error ?? errParam}
        </p>
      )}

      <button
        type="submit"
        disabled={signInPending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {signInPending && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {signInPending ? "Signing in…" : "Sign in"}
      </button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setMode("reset")}
          className="font-medium text-navy-700 hover:underline dark:text-navy-300"
        >
          First time here? Set a password
        </button>
        <button
          type="button"
          onClick={() => setMode("reset")}
          className="font-medium text-navy-700 hover:underline dark:text-navy-300"
        >
          Forgot password?
        </button>
      </div>
    </form>
  );
}
