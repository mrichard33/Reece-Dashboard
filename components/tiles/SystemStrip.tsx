import Link from "next/link";
import type { Route } from "next";
import { InfoPopover } from "@/components/help/InfoPopover";
import { dotClass, type SystemChip } from "@/lib/queries/systemStatus.core";
import type { StripResult } from "@/lib/queries/systemStatus";
import { cn, relTime } from "@/lib/utils";

/**
 * Eight system chips above the health tiles on /overview (LP-MCP System
 * Health, 2026-10-15). Solid dot = live checks; ring = still in test mode
 * (what the platform WOULD report; the note never says "shadow"); grey = no
 * checks. Each chip opens
 * /system-health filtered to that system.
 */
export function SystemStrip({ strip }: { strip: StripResult }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Systems
        </h2>
        <InfoPopover helpKey="overview.systemStrip" />
      </div>
      {strip.state === "ok" ? (
        <div className="flex flex-wrap gap-2">
          {strip.chips.map((c) => <Chip key={c.id} chip={c} />)}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {strip.state === "missing"
            ? "System health is not set up yet (the LP-MCP health views are missing)."
            : `System health could not be read: ${strip.message}`}
        </p>
      )}
    </section>
  );
}

function Chip({ chip }: { chip: SystemChip }) {
  return (
    <Link
      href={`/system-health?system=${chip.id}` as Route}
      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      title={`${chip.label}: ${chip.note}${chip.lastObservedAt ? ` · checked ${relTime(chip.lastObservedAt)}` : ""}`}
    >
      <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", dotClass(chip.color, chip.hollow))} aria-hidden />
      <span className="font-medium text-navy-900 dark:text-slate-100">{chip.label}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{chip.note}</span>
    </Link>
  );
}
