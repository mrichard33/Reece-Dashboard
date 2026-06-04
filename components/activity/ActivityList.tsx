"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ChevronRight, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { eventMeta } from "./eventMeta";
import { absTime, relTime, usd } from "@/lib/utils";
import type { ActivityItem, LeadLite } from "@/lib/supabase/types";

function contactName(lead: LeadLite | null): string | null {
  if (!lead) return null;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

/** A small labeled chip used for Prospect # / LP Source / LP Subsource. */
function MetaChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] dark:bg-slate-800">
      <span className="font-medium text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-slate-700 dark:text-slate-200">{value}</span>
    </span>
  );
}

function priorityBadge(priority: ActivityItem["priority"]) {
  if (priority === "critical")
    return (
      <Badge tone="rose" dot>
        Critical
      </Badge>
    );
  if (priority === "high")
    return (
      <Badge tone="amber" dot>
        High
      </Badge>
    );
  return null;
}

export function ActivityList({ items }: { items: ActivityItem[] }) {
  const [selected, setSelected] = useState<ActivityItem | null>(null);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">No recent activity.</p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => {
          const meta = eventMeta(item.event_type);
          const name = contactName(item.lead);
          const isContact = !meta.isSystem && (!!item.lead || !!name);

          // Compact, de-emphasized row for system / contactless events.
          if (!isContact) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex w-full items-center gap-2 py-2 text-left text-slate-500 transition hover:text-navy-700 dark:hover:text-slate-200"
                >
                  <Activity className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                  <span className="text-xs">{meta.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400">
                    {relTime(item.created_at)}
                  </span>
                </button>
              </li>
            );
          }

          // Rich card for contact-linked activity.
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="group flex w-full items-start gap-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {priorityBadge(item.priority)}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-navy-900 dark:text-slate-100">
                    {name ?? "Unknown contact"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <MetaChip label="Prospect #" value={item.lead?.lp_prospect_id ?? item.lp_prospect_id} />
                    <MetaChip label="Source" value={item.lead?.lead_source} />
                    <MetaChip label="Subsource" value={item.lead?.lead_source_detail} />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {relTime(item.created_at)}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300 transition group-hover:text-slate-500" />
              </button>
            </li>
          );
        })}
      </ul>

      <ActivityDetail item={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-navy-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/** Renders a flat-ish object as readable key/value rows; falls back to JSON. */
function StateBlock({ obj }: { obj: Record<string, unknown> | null }) {
  if (!obj || Object.keys(obj).length === 0) return null;
  return (
    <dl className="rounded-md bg-slate-50 p-3 dark:bg-slate-800/50">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-0.5 text-xs">
          <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
          <dd className="break-all text-right font-mono text-slate-700 dark:text-slate-200">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActivityDetail({
  item,
  onClose,
}: {
  item: ActivityItem | null;
  onClose: () => void;
}) {
  if (!item) return null;
  const meta = eventMeta(item.event_type);
  const lead = item.lead;
  const name = contactName(lead);
  const leadId = lead?.lp_lead_id ?? item.lp_lead_id;

  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      title={meta.label}
      subtitle={absTime(item.created_at)}
    >
      <div className="space-y-5">
        {(name || lead) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Contact
            </h3>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <DetailRow label="Name" value={name ?? "Unknown"} />
              <DetailRow label="Prospect #" value={lead?.lp_prospect_id ?? item.lp_prospect_id} />
              <DetailRow label="LP Source" value={lead?.lead_source} />
              <DetailRow label="LP Subsource" value={lead?.lead_source_detail} />
              <DetailRow label="Phone" value={lead?.phone} />
              <DetailRow label="Email" value={lead?.email} />
              <DetailRow label="Rep" value={lead?.rep_name} />
              <DetailRow label="Status" value={lead?.disposition_label} />
              <DetailRow
                label="Appointment set"
                value={lead?.appointment_set == null ? null : lead.appointment_set ? "Yes" : "No"}
              />
              <DetailRow
                label="Demo completed"
                value={lead?.demo_completed == null ? null : lead.demo_completed ? "Yes" : "No"}
              />
              <DetailRow
                label="Job value"
                value={lead?.job_value ? usd(lead.job_value) : null}
              />
            </dl>
          </section>
        )}

        {leadId && (
          <Link
            href={`/leads/${leadId}` as never}
            className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            View full lead timeline <ChevronRight className="h-4 w-4" />
          </Link>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Activity
          </h3>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            <DetailRow label="What happened" value={meta.label} />
            <DetailRow label="When" value={absTime(item.created_at)} />
            <DetailRow label="Priority" value={item.priority ?? "normal"} />
            <DetailRow label="Source system" value={item.source} />
            <DetailRow
              label="Event type"
              value={<span className="font-mono text-[11px]">{item.event_type}</span>}
            />
          </dl>
        </section>

        {(item.previous_state || item.new_state) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              What changed
            </h3>
            {item.previous_state && (
              <>
                <p className="mb-1 text-[11px] text-slate-400">Before</p>
                <StateBlock obj={item.previous_state} />
              </>
            )}
            {item.new_state && (
              <>
                <p className="mb-1 mt-2 text-[11px] text-slate-400">After</p>
                <StateBlock obj={item.new_state} />
              </>
            )}
          </section>
        )}

        {item.payload && Object.keys(item.payload).length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Additional details
            </h3>
            <StateBlock obj={item.payload} />
          </section>
        )}
      </div>
    </Drawer>
  );
}
