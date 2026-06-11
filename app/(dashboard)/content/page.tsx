import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, format } from "date-fns";
import { getAccessContext } from "@/lib/auth";
import { listPostsForRange, listPlanForRange, getFbTuning } from "@/lib/queries/content";
import { Calendar } from "@/components/content/Calendar";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getAccessContext();
  const isExecutive = ctx?.isExecutive ?? false;

  const now = new Date();
  let year = now.getFullYear();
  let monthIndex = now.getMonth();
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const parts = sp.month.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    if (y && m && m >= 1 && m <= 12) {
      year = y;
      monthIndex = m - 1;
    }
  }

  const first = new Date(year, monthIndex, 1);
  const gridStart = startOfWeek(startOfMonth(first), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(first), { weekStartsOn: 0 });
  const [posts, plan, tuning] = await Promise.all([
    listPostsForRange(format(gridStart, "yyyy-MM-dd"), format(gridEnd, "yyyy-MM-dd")),
    listPlanForRange(format(gridStart, "yyyy-MM-dd"), format(gridEnd, "yyyy-MM-dd")),
    getFbTuning(),
  ]);

  return (
    <div className="p-6">
      <Calendar
        posts={posts}
        plan={plan}
        year={year}
        monthIndex={monthIndex}
        isExecutive={isExecutive}
        initialNeedsOnly={sp.filter === "needs"}
        planHorizonDays={tuning.planHorizonDays}
        maxPerGeneration={tuning.maxPerGeneration}
        defaultPostTime={tuning.defaultPostTime}
      />
    </div>
  );
}
