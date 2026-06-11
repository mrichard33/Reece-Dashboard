import { requireExecAdmin } from "@/components/shell/RoleGate";
import { getFbConnection } from "@/lib/actions/settings";
import { FbConnectionCard } from "@/components/settings/FbConnectionCard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Admin-only (Mark). Non-admin executives are redirected to /approvals.
  await requireExecAdmin();
  const connection = await getFbConnection();

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-slate-800 dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Connection and publishing configuration for Mission Control.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FbConnectionCard connection={connection} />
      </div>
    </div>
  );
}
