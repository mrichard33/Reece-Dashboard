import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { Tooltip } from "@/components/ui/Tooltip";
import { StatTile } from "@/components/tiles/StatTile";
import { InfoPopover } from "@/components/help/InfoPopover";
import {
  FEATURE_MODES_MIGRATION,
  REVIEW_AFTER_DAYS,
  daysLabel,
  evidenceLabel,
  stateBadge,
  summarizeModes,
  type ModeChangeRow,
  type ModeItem,
  type ModesPageData,
  type ModeState,
} from "@/lib/queries/modes.core";
import { absTime, relTime } from "@/lib/utils";

/**
 * The /modes page body (Fix 2, 2026-10-12). Presentational only, so it renders
 * from sample data too; app/(dashboard)/modes/page.tsx does the role gate and
 * the read. Read-only: a flip is a Railway variable a person sets.
 */

const SECTIONS: { state: ModeState; title: string; open: boolean; blurb: string }[] = [
  { state: "other", title: "Unrecognised values", open: true, blurb: "The variable is set to something the code does not know. Check the spelling in Railway." },
  { state: "shadow", title: "In test mode", open: true, blurb: "Works out what it would do and records it, but does not act yet." },
  { state: "off", title: "Off", open: false, blurb: "Switched off." },
  { state: "live", title: "Live", open: false, blurb: "Acting for real." },
  { state: "choice", title: "Settings", open: false, blurb: "A setting with no test stage (for example which Five9 mode to use)." },
];

export function ModesView({ data }: { data: ModesPageData }) {
  const s = summarizeModes(data.items);
  return (
    <>
    {data.needsMigration ? (
      <MigrationCard />
    ) : (
      <>
        <section>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="In test mode" value={s.shadow} deltaTone="amber" helpKey="modes.shadow" />
            <StatTile
              label={`Due for review`}
              value={s.dueForReview}
              deltaTone="amber"
              suffix={s.dueForReview > 0 ? `${REVIEW_AFTER_DAYS}d+` : undefined}
              helpKey="modes.due"
            />
            <StatTile label="No go-live test" value={s.noRuling} deltaTone="rose" helpKey="modes.noRuling" />
            <StatTile label="Live" value={s.live} deltaTone="emerald" helpKey="modes.live" />
          </div>
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            {s.total} switches.{" "}
            {data.registeredAt ? (
              <Tooltip label={absTime(data.registeredAt)}>
                <span>Values as of LP-MCP&apos;s last start, {relTime(data.registeredAt)}.</span>
              </Tooltip>
            ) : (
              "LP-MCP has not written these yet."
            )}{" "}
            A change in Railway shows here after the next restart.
          </p>
          {Object.entries(data.errors).map(([k, v]) => (
            <div key={k} className="mt-3">
              <ErrBanner label={k} msg={v} />
            </div>
          ))}
        </section>

        {SECTIONS.map((sec) => {
          const items = data.items.filter((i) => i.state === sec.state);
          if (!items.length) return null;
          return <ModeSection key={sec.state} {...sec} items={items} />;
        })}

        <ChangesCard changes={data.changes} />
      </>
    )}
    </>
  );
}

function ModeSection({
  state,
  title,
  open,
  blurb,
  items,
}: {
  state: ModeState;
  title: string;
  open: boolean;
  blurb: string;
  items: ModeItem[];
}) {
  return (
    <Card>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle>{title}</CardTitle>
              <Badge tone={stateBadge(state).tone}>{items.length}</Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{blurb}</p>
          </div>
          <span className="text-[11px] text-slate-400 group-open:hidden">Show</span>
          <span className="hidden text-[11px] text-slate-400 group-open:inline">Hide</span>
        </summary>
        <CardContent>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((i) => (
              <ModeRow key={i.name} item={i} />
            ))}
          </ul>
        </CardContent>
      </details>
    </Card>
  );
}

function ModeRow({ item }: { item: ModeItem }) {
  const badge = stateBadge(item.state);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all text-[12.5px] font-semibold text-navy-900 dark:text-slate-100">{item.name}</code>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {item.dueForReview && <Badge tone="amber">Due for review</Badge>}
        <span className="text-[11px] text-slate-400">{item.group}</span>
      </div>
      {item.note && <p className="mt-1 break-words text-sm text-slate-700 dark:text-slate-300">{item.note}</p>}
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Value">
          <span className="break-all">{item.value}</span>
          {!item.isSet && <span className="text-slate-400"> (default)</span>}
        </Field>
        <Field label="In this state">{daysLabel(item)}</Field>
        <Field label="Decides">{item.decider}</Field>
        <Field label="Results">
          <span className="break-words">{evidenceLabel(item)}</span>
        </Field>
      </dl>
      {item.state === "shadow" && (
        <p
          className={`mt-1 break-words text-[12px] ${
            item.hasRuling ? "text-slate-600 dark:text-slate-300" : "text-rose-700 dark:text-rose-400"
          }`}
        >
          <span className="font-medium">Goes live when: </span>
          {item.hasRuling ? item.goLive : "no go-live test yet. Needs a ruling."}
        </p>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="inline text-slate-400">{label}: </dt>
      <dd className="inline text-slate-700 dark:text-slate-200">{children}</dd>
    </div>
  );
}

function ChangesCard({ changes }: { changes: ModeChangeRow[] }) {
  return (
    <Card>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <CardTitle>Recent switch changes</CardTitle>
          <InfoPopover helpKey="modes.changes" />
        </div>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No changes recorded yet. Each change is recorded the first time LP-MCP starts with the new value.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 py-2 text-[12.5px]">
                <code className="break-all font-semibold text-navy-900 dark:text-slate-100">{c.name}</code>
                <span className="text-slate-600 dark:text-slate-300">
                  {c.from_value ?? "—"} → {c.to_value ?? "—"}
                </span>
                <Tooltip label={absTime(c.changed_at)}>
                  <span className="text-[11px] text-slate-400">{relTime(c.changed_at)}</span>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MigrationCard() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-navy-900 dark:text-slate-100">
          This page needs the feature_modes migration
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          It ships as
          <code className="mx-1 break-all rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
            {FEATURE_MODES_MIGRATION.file}
          </code>
          in the {FEATURE_MODES_MIGRATION.repo} repo and is applied automatically when that pull request merges.
          LP-MCP fills the table the next time it starts.
        </p>
      </CardContent>
    </Card>
  );
}

function ErrBanner({ label, msg }: { label: string; msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2 dark:border-rose-900 dark:bg-rose-950">
      <StatusDot status="critical" animate={false} />
      <p className="break-words text-[11px] text-rose-700 dark:text-rose-300">
        <span className="font-semibold">{label} read failed:</span> {msg}
      </p>
    </div>
  );
}
