import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-800 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-brick" />
          <div>
            <h1 className="font-display text-xl font-semibold text-navy-900 dark:text-white">
              Mission Control
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Reece Windows &amp; Doors
            </p>
          </div>
        </div>

        <Suspense fallback={<div className="h-32 shimmer rounded" />}>
          <LoginForm />
        </Suspense>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Access is restricted to allowlisted accounts.
        </p>
      </div>
    </main>
  );
}
