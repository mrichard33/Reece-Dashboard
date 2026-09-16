import { describe, expect, it } from "vitest";
import {
  formatDuration,
  jobBadge,
  jobDot,
  jobSummaryLine,
  summarizeJobs,
  toJobRow,
  toJobRows,
  type JobRow,
} from "./agent.core";
import { isMissingColumn, isMissingRelation } from "./pgErrors";
import type { JobStatusRow } from "@/lib/supabase/types";

/**
 * The roster view model. Two of its states are the reason the page exists:
 *
 *   never     a registered, enabled job with no runs. Before job_runs there was
 *             no way to see a job that had quietly stopped happening, which is
 *             the failure mode behind both the 47-hour and 71-day incidents.
 *   disabled  a job switched off on purpose. It must never read as stale — an
 *             alarm that fires on the healthy case is how a board gets muted.
 */

const row = (over: Partial<JobStatusRow> = {}): JobStatusRow => ({
  job_id: "memory-nightly",
  label: "Memory nightly",
  job_group: "memory",
  cadence: "daily 03:00 ET",
  enabled_env: "MEMORY_NIGHTLY_ENABLED",
  enabled_default: true,
  enabled: true,
  last_status: "ok",
  last_started_at: "2026-09-16T07:00:00.000Z",
  last_finished_at: "2026-09-16T07:00:04.000Z",
  last_elapsed_ms: 4000,
  last_summary: "closed=3 digest=1",
  last_instance_id: "replica-1",
  runs_24h: 1,
  ok_24h: 1,
  failed_24h: 0,
  unknown_24h: 0,
  interrupted_24h: 0,
  ...over,
});

describe("toJobRow", () => {
  it("passes a healthy run through", () => {
    const r = toJobRow(row());
    expect(r.health).toBe("ok");
    expect(r.id).toBe("memory-nightly");
    expect(r.cadence).toBe("daily 03:00 ET");
    expect(r.lastSummary).toBe("closed=3 digest=1");
    expect(r.disabledBy).toBeNull();
  });

  it("a registered job that has never run reads 'never', not 'ok'", () => {
    const r = toJobRow(row({ last_status: null, last_started_at: null, last_summary: null }));
    expect(r.health).toBe("never");
  });

  it("a job switched off reads 'disabled' and names the switch, even with no runs", () => {
    const r = toJobRow(row({ enabled: false, last_status: null, last_started_at: null }));
    expect(r.health).toBe("disabled");
    expect(r.disabledBy).toBe("MEMORY_NIGHTLY_ENABLED");
  });

  it("disabled outranks a stale last run, so a dark job is never called failing", () => {
    const r = toJobRow(row({ enabled: false, last_status: "failed" }));
    expect(r.health).toBe("disabled");
  });

  it("carries failed and unknown through from the database", () => {
    expect(toJobRow(row({ last_status: "failed" })).health).toBe("failed");
    expect(toJobRow(row({ last_status: "unknown" })).health).toBe("unknown");
    expect(toJobRow(row({ last_status: "interrupted" })).health).toBe("interrupted");
    expect(toJobRow(row({ last_status: "skipped" })).health).toBe("skipped");
    expect(toJobRow(row({ last_status: "running" })).health).toBe("running");
  });

  it("a status this build does not recognise is unknown, never ok", () => {
    expect(toJobRow(row({ last_status: "quantum" })).health).toBe("unknown");
  });

  it("defaults the 24h tallies rather than rendering undefined", () => {
    const r = toJobRow(row({ runs_24h: undefined as never, failed_24h: undefined as never }));
    expect(r.runs24h).toBe(0);
    expect(r.failed24h).toBe(0);
  });

  it("maps a whole roster", () => {
    expect(toJobRows([row(), row({ job_id: "omi-pull", enabled: false })])).toHaveLength(2);
  });
});

describe("jobDot and jobBadge", () => {
  it("only a successful run is green", () => {
    expect(jobDot("ok")).toBe("healthy");
    expect(jobDot("failed")).toBe("critical");
    expect(jobDot("disabled")).toBe("neutral");
    expect(jobDot("running")).toBe("neutral");
  });

  it("a job that never ran, or could not conclude, is amber — not quietly grey", () => {
    expect(jobDot("never")).toBe("warning");
    expect(jobDot("unknown")).toBe("warning");
  });

  it("an interrupted or skipped pass is neutral, because neither is a defect", () => {
    // A deploy killing a pass is infrastructure; a re-entrancy guard declining
    // to start is the system working. Colouring either red trains people to
    // ignore the board.
    expect(jobDot("interrupted")).toBe("neutral");
    expect(jobDot("skipped")).toBe("neutral");
  });

  it("labels every health exactly once", () => {
    const healths = [
      "ok", "failed", "unknown", "interrupted", "skipped", "running", "never", "disabled",
    ] as const;
    const labels = healths.map((h) => jobBadge(h).label);
    expect(new Set(labels).size).toBe(healths.length);
    expect(jobBadge("never").label).toBe("Never run");
    expect(jobBadge("disabled").tone).toBe("slate");
    expect(jobBadge("failed").tone).toBe("rose");
  });
});

describe("summarizeJobs", () => {
  const mk = (health: JobRow["health"]): JobRow => ({
    id: health, label: health, group: "g", cadence: null, health,
    disabledBy: null, lastStartedAt: null, lastElapsedMs: null, lastSummary: null,
    runs24h: 0, failed24h: 0, unknown24h: 0,
  });

  it("counts a never-run job as needing attention, same as one that could not conclude", () => {
    const s = summarizeJobs([mk("ok"), mk("failed"), mk("never"), mk("unknown"), mk("disabled")]);
    expect(s).toEqual({ total: 5, failing: 1, attention: 2, disabled: 1 });
  });

  it("leaves zero counts out of the line", () => {
    expect(jobSummaryLine(summarizeJobs([mk("ok"), mk("ok")]))).toBe("2 jobs");
    expect(jobSummaryLine(summarizeJobs([mk("ok"), mk("failed")]))).toBe("2 jobs · 1 failing");
    expect(jobSummaryLine(summarizeJobs([]))).toBe("No jobs registered");
  });
});

describe("formatDuration", () => {
  it("reads at a glance instead of in milliseconds", () => {
    expect(formatDuration(340)).toBe("340ms");
    expect(formatDuration(4000)).toBe("4.0s");
    expect(formatDuration(124_000)).toBe("2m 04s");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("the migration guard still holds after the hoist", () => {
  // /agent needs the same predicates the Command Center uses, and sql/113 adds
  // a column with ALTER ... IF NOT EXISTS — so a half-applied migration leaves
  // the view present but short a column, which isMissingRelation cannot see.
  it("recognises a missing relation and a missing column separately", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "42703" })).toBe(false);
    expect(isMissingColumn({ code: "42703", message: 'column "enabled" does not exist' })).toBe(true);
    expect(isMissingColumn({ message: 'relation "v_job_status" does not exist' })).toBe(false);
  });

  it("does not claim an unrelated failure is a missing migration", () => {
    for (const e of [
      { code: "42501", message: "permission denied for view v_job_status" },
      { code: "57014", message: "canceling statement due to statement timeout" },
      { message: "TypeError: fetch failed" },
      null,
    ]) {
      expect(isMissingRelation(e)).toBe(false);
      expect(isMissingColumn(e)).toBe(false);
    }
  });
});
