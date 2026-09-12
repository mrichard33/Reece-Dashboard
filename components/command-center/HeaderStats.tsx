import { Card, CardContent } from "@/components/ui/Card";
import { InfoPopover } from "@/components/help/InfoPopover";
import {
  agreementPct, AGREEMENT_MIN_SAMPLE,
  type HeaderStats as Stats, type Agreement,
} from "@/lib/queries/commandCenter";

/**
 * The numbers across the top: what is waiting, how long the oldest one has
 * waited, whether the pile is moving, and whether the AI is worth agreeing with.
 * The week-on-week line is the point — a backlog of 385 only means something
 * next to "you ruled 40 this week".
 */
export function HeaderStats({ stats, agreement }: { stats: Stats; agreement: Agreement }) {
  const delta = stats.ruledThisWeek - stats.ruledLastWeek;
  const trend =
    stats.ruledLastWeek === 0 && stats.ruledThisWeek === 0
      ? "none yet"
      : `${delta >= 0 ? "+" : ""}${delta} vs last week`;

  // Two rulings do not make a hit rate. Until there are enough, the tile says
  // how far off it is rather than showing a number nobody should act on.
  const overall = agreementPct(agreement);
  const high = agreementPct(agreement.byConfidence.high);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Tile
        helpKey="commandCenter.rulingsOpen"
        label="Waiting on you"
        value={stats.rulingsOpen.toLocaleString()}
        sub="rulings in the queue"
      />
      <Tile
        helpKey="commandCenter.oldest"
        label="Oldest"
        value={stats.oldestRulingDays == null ? "—" : `${stats.oldestRulingDays}d`}
        sub="the longest anything has waited"
      />
      <Tile
        helpKey="commandCenter.ruledThisWeek"
        label="Ruled this week"
        value={stats.ruledThisWeek.toLocaleString()}
        sub={trend}
      />
      <Tile
        helpKey="commandCenter.agreement"
        label="AI agreement"
        value={overall == null ? "\u2014" : `${overall}%`}
        sub={
          overall == null
            ? `${agreement.total} of ${AGREEMENT_MIN_SAMPLE} rulings needed`
            : high == null
              ? `over the last ${agreement.total} rulings`
              : `high confidence: ${high}%`
        }
        muted={overall == null}
      />
      <Tile
        helpKey="commandCenter.release2"
        label="Coming in Release 2"
        value={`${stats.staleIssuesOpen} / ${stats.todosOpen}`}
        sub="stale issues / to-dos"
        muted
      />
    </div>
  );
}

function Tile({
  helpKey, label, value, sub, muted,
}: {
  helpKey: string; label: string; value: string; sub: string; muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <InfoPopover helpKey={helpKey} />
        </div>
        <div
          className={
            muted
              ? "mt-1 text-2xl font-semibold text-slate-400 dark:text-slate-500"
              : "mt-1 text-2xl font-semibold text-navy-900 dark:text-slate-100"
          }
        >
          {value}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</div>
      </CardContent>
    </Card>
  );
}
