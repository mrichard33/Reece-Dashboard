import { requireRole } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ModesView } from "@/components/modes/ModesView";
import { getModesPageData } from "@/lib/queries/modes";

/**
 * /modes — every LP-MCP feature switch and whether it is live (Fix 2, 2026-10-12).
 *
 * About half of LP-MCP's 91 `*_MODE` flags run in shadow ("test mode"): the
 * feature works out what it would do and records it, but does not act. Before
 * this page nothing showed which were waiting, for how long, or on whose call.
 *
 * Read-only. A flip is a Railway variable set by Mark (or the user); this page
 * never changes one. "Due for review" means a flag has been in test mode for
 * 14+ days and someone should look, not that it is ready.
 */

export const dynamic = "force-dynamic";

export default async function ModesPage() {
  const user = await requireRole("operator");
  const data = await getModesPageData();

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Test-mode features" />

      <div className="space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="Test-mode features"
          subtitle="Every LP-MCP feature switch: which are live, which are still in test mode, for how long, and what would justify switching them on."
        />
        <ModesView data={data} />
      </div>
    </>
  );
}
