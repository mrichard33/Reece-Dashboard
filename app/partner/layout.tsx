import Image from "next/image";
import { redirect } from "next/navigation";
import { getPartnerContext } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

/**
 * Shell for payroll PARTNER accounts (db/migrations/0026). Deliberately NOT the
 * (dashboard) layout: a partner gets no sidebar, no navigation and no route
 * into anything else. Every page under /partner re-derives the partner from the
 * signed-in account.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partner = await getPartnerContext();
  if (!partner) redirect("/login");

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Image src="/reece-logo.png" alt="Reece Windows & Doors" width={28} height={28} />
          <span className="text-sm font-semibold text-navy-900 dark:text-white">Reece × {partner.partnerName}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="hidden sm:inline">{partner.email}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-4 lg:p-6">{children}</main>
    </div>
  );
}
