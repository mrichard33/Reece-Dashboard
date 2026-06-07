import Image from "next/image";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-800 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/reece-logo.png"
            alt="Reece Windows & Doors"
            width={40}
            height={40}
            className="h-10 w-10 rounded-lg object-contain"
            priority
          />
          <div>
            <h1 className="font-display text-xl font-semibold text-navy-900 dark:text-white">
              Set your password
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mission Control — Reece Windows &amp; Doors
            </p>
          </div>
        </div>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
