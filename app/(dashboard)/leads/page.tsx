import { requireUser } from "@/components/shell/RoleGate";
import { TopBar } from "@/components/shell/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { LeadFilters, LeadSearch } from "@/components/leads/LeadFilters";
import {
  getLeadFilterOptions,
  getLeadsPage,
  type LeadFilterOptions,
  type LeadsPage,
  parseLeadsQuery,
} from "@/lib/queries/leadsList";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

const NO_OPTIONS: LeadFilterOptions = { sources: [], lanes: [], lpRoutes: [], workflows: [], pipelines: [] };

/**
 * Leads tab — every lead, newest entry first, each row expanding into its
 * full journey (Past / Now / Next). Read-only over the HL cache, with LP
 * consulted per contact when a row is opened.
 */
export default async function LeadsPageRoute({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { filters, search, view, cursor } = parseLeadsQuery(sp);

  const [page, options] = await Promise.all([
    getLeadsPage({ cursor, filters, search }).catch((e: unknown): LeadsPage | null => {
      console.error("[leads]", e);
      return null;
    }),
    getLeadFilterOptions().catch(() => NO_OPTIONS),
  ]);

  // The table's "Load more" re-sends this page's filters without the cursor.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "cursorDate" || k === "cursorId" || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) query.append(k, one);
  }

  return (
    <>
      <TopBar email={user.email} role={user.role} title="Leads" subtitle="Every lead's full journey" />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <LeadSearch initial={search} />
          <InfoPopover helpKey="leads.search" />
        </div>

        {!search && <LeadFilters options={options} filters={filters} view={view} />}

        <Card>
          <CardHeader>
            <CardTitle>
              {search ? `Search: “${search}”` : "Leads — newest first"}
              {page?.searchMode && <span className="ml-2 text-xs font-normal text-slate-500">matched by {page.searchMode}</span>}
            </CardTitle>
            <InfoPopover helpKey="leads.list" />
          </CardHeader>
          <CardContent>
            {page?.truncated && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                This filter matched more than 3,000 contacts; the list shows the newest among the first 3,000 found.
                Narrow it with a date or a stage.
              </p>
            )}
            {!page ? (
              <p className="py-8 text-center text-sm text-rose-600 dark:text-rose-400">
                Could not read leads from the GHL cache. Try again in a minute.
              </p>
            ) : (
              <LeadsTable key={query.toString()} initial={page} query={query.toString()} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
