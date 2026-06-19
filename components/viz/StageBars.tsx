import { Tooltip } from "@/components/ui/Tooltip";
import { num } from "@/lib/utils";

export type StageDatum = {
  id?: string;
  name: string;
  count: number;
  avgAgeDays: number;
};

function ageTone(days: number): {
  bg: string;
  dot: string;
  text: string;
  label: "healthy" | "watch" | "stalled";
} {
  if (days < 7)
    return { bg: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-50", label: "healthy" };
  if (days < 14)
    return { bg: "bg-amber-500", dot: "bg-amber-500", text: "text-amber-50", label: "watch" };
  return { bg: "bg-rose-500", dot: "bg-rose-500", text: "text-rose-50", label: "stalled" };
}

export function StageBars({ stages }: { stages: StageDatum[] }) {
  const visible = stages.filter((s) => s.count > 0);
  const total = visible.reduce((a, s) => a + s.count, 0) || 1;

  return (
    <div>
      {/* Stacked proportional bar — count inside each segment, colored by aging. */}
      <div className="flex h-9 w-full overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        {visible.map((s) => {
          const pct = (s.count / total) * 100;
          const tone = ageTone(s.avgAgeDays);
          return (
            <div key={s.id ?? s.name} style={{ width: `${pct}%` }} className="h-full">
              <Tooltip
                label={`${s.name}: ${num(s.count)} opps · avg ${s.avgAgeDays}d idle (${tone.label})`}
                className="h-full w-full"
              >
                <div
                  className={`flex h-full w-full items-center justify-center text-[10px] font-semibold ${tone.bg} ${tone.text} transition`}
                >
                  {pct >= 7 ? num(s.count) : ""}
                </div>
              </Tooltip>
            </div>
          );
        })}
      </div>

      {/* Desktop: stage names aligned under their segments (matches mockup). */}
      <div className="mt-2 hidden w-full md:flex">
        {visible.map((s) => {
          const pct = (s.count / total) * 100;
          return (
            <div
              key={s.id ?? s.name}
              style={{ width: `${pct}%` }}
              className="px-1 text-center"
              title={s.name}
            >
              <span className="block truncate text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                {s.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: legend chips (proportional labels are unreadable when narrow). */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:hidden">
        {visible.map((s) => {
          const tone = ageTone(s.avgAgeDays);
          return (
            <div
              key={s.id ?? s.name}
              className="flex items-center gap-2 rounded border border-slate-100 px-2 py-1 dark:border-slate-800"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} />
              <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{s.name}</span>
              <span className="font-mono tabular text-slate-500 dark:text-slate-400">
                {num(s.count)} · {s.avgAgeDays}d
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
