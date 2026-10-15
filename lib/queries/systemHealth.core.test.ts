/**
 * /system-health: checks grouped by system and family, a stale check says how
 * long it has been silent, the 24h timeline colors buckets by the worst result
 * (grey where nothing reported), thresholds come from the check's config.
 */
import { describe, expect, it } from "vitest";
import { buildTimelines, leadLeaksLink, resultColor, shapeSystems, staleNote, thresholdLines, timelineProblems, type CheckLatestRaw } from "./systemHealth.core";

const NOW = Date.parse("2026-10-15T18:00:00Z");
function check(over: Partial<CheckLatestRaw>): CheckLatestRaw {
  return {
    check_id: "x.y", family: "lead", system: "five9", label: "X", question: "Q?", severity: "P2", cadence: "every 5 min",
    active_window: null, stale_after_min: 12, warn_rule: "w", fail_rule: "f", config: {}, mode: "shadow", owner_job_id: "health-checks",
    business_impact: null, enabled: true, last_status: "pass", last_observed_at: "2026-10-15T17:58:00Z", last_summary: "ok",
    last_value: 1, minutes_since: 2, color: "green", ...over,
  };
}

describe("shapeSystems", () => {
  it("groups by system and family, worst color first, counts", () => {
    const out = shapeSystems([
      check({ check_id: "a", color: "green" }),
      check({ check_id: "b", color: "red", label: "B" }),
      check({ check_id: "c", system: "ghl", family: "sync", color: "yellow" }),
      check({ check_id: "d", color: "disabled" }),
    ]);
    const five9 = out.systems.find((s) => s.id === "five9")!;
    expect(five9.color).toBe("red");
    expect(five9.families[0]?.checks[0]?.id).toBe("b");
    expect(out.counts).toEqual({ red: 1, yellow: 1, green: 1 });
    expect(out.systems.find((s) => s.id === "n8n")!.color).toBe("grey");
    expect(five9.hollow).toBe(true);
  });
  it("a check that is not built yet is grey, 'coming later', and never needs a look", () => {
    const out = shapeSystems([
      check({ check_id: "n8n.exec", system: "n8n", family: "workflow", color: "yellow", last_status: "unknown", last_summary: "Not built yet (Phase 2)", last_observed_at: null }),
      check({ check_id: "n8n.up", system: "n8n", family: "service", color: "green" }),
    ]);
    const n8n = out.systems.find((s) => s.id === "n8n")!;
    const later = n8n.families.flatMap((f) => f.checks).find((c) => c.id === "n8n.exec")!;
    expect(later).toMatchObject({ comingLater: true, color: "grey", staleNote: null });
    expect(n8n.color).toBe("green");
    expect(out.counts).toEqual({ red: 0, yellow: 0, green: 1 });
  });
  it("stale note says how long and the expected cadence", () => {
    expect(staleNote({ last_observed_at: null, minutes_since: null, stale_after_min: 12, cadence: "every 5 min" })).toBe("no result yet (expected every 5 min)");
    expect(staleNote({ last_observed_at: "x", minutes_since: 23, stale_after_min: 12, cadence: "every 5 min" })).toBe("no result for 23 min (expected every 5 min)");
    expect(staleNote({ last_observed_at: "x", minutes_since: 3, stale_after_min: 12, cadence: "every 5 min" })).toBeNull();
  });
});

describe("timeline", () => {
  it("worst result per 30-min bucket; grey when nothing; skipped colors nothing", () => {
    const meta = new Map([["a", { system: "five9", severity: "P1" }], ["b", { system: "five9", severity: "P3" }]]);
    const t = buildTimelines([
      { check_id: "a", status: "pass", observed_at: "2026-10-15T17:40:00Z" },
      { check_id: "b", status: "fail", observed_at: "2026-10-15T17:45:00Z" },
      { check_id: "a", status: "fail", observed_at: "2026-10-15T16:10:00Z" },
      { check_id: "a", status: "skipped", observed_at: "2026-10-15T15:10:00Z" },
    ], meta, NOW);
    const segs = t.five9 ?? [];
    expect(segs).toHaveLength(48);
    expect(segs[47]?.color).toBe("yellow"); // P3 fail beats a pass
    expect(segs[44]?.color).toBe("red");    // P1 fail at 16:10
    expect(segs[42]?.color).toBe("grey");   // skipped only
    expect(resultColor("unknown", "P1")).toBe("yellow");
  });
});

describe("timeline: what the bar shows (2026-10-15)", () => {
  const meta = new Map([
    ["agent.executor_heartbeat", { system: "ai_agents", severity: "P1", label: "Automation worker running" }],
    ["syn.chatbot_reply", { system: "ai_agents", severity: "P2", label: "Chatbot test run" }],
  ]);
  const results = [
    { check_id: "syn.chatbot_reply", status: "unknown", observed_at: "2026-10-15T15:54:00Z", summary: "Coming later: test runs are not built yet." },
    { check_id: "agent.executor_heartbeat", status: "fail", observed_at: "2026-10-15T04:05:00Z", summary: "last executor run 20 min ago with actions pending" },
    { check_id: "agent.executor_heartbeat", status: "warn", observed_at: "2026-10-15T15:18:00Z", summary: "last executor run 4 min ago with actions pending" },
    { check_id: "agent.executor_heartbeat", status: "pass", observed_at: "2026-10-15T17:50:00Z", summary: "The automation worker is running." },
  ];
  it("a Coming later check never paints the bar yellow", () => {
    const segs = buildTimelines(results, meta, NOW).ai_agents ?? [];
    expect(segs.some((s) => s.color === "yellow" && s.startMs <= Date.parse("2026-10-15T15:54:00Z") && s.endMs > Date.parse("2026-10-15T15:54:00Z"))).toBe(false);
  });
  it("names each check that was red or yellow, worst first, with when", () => {
    const p = timelineProblems(results, meta, NOW).ai_agents ?? [];
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ label: "Automation worker running", color: "red", times: 2, lastSummary: "last executor run 4 min ago with actions pending" });
    expect(p[0]?.firstMs).toBe(Date.parse("2026-10-15T04:05:00Z"));
  });
});

describe("check detail helpers", () => {
  it("threshold lines from config", () => {
    expect(thresholdLines({ warn_wait_min: 30, fail_wait_min: 60, source: "x" })).toEqual({ warn: 30, fail: 60, key: "wait_min" });
    expect(thresholdLines({ warn: 5, fail: 20 })).toEqual({ warn: 5, fail: 20, key: "count" });
    expect(thresholdLines({})).toEqual({ warn: null, fail: null, key: null });
  });
  it("lead and dialer checks link to Lead Leaks", () => {
    expect(leadLeaksLink("lead.in_inbound_queue")).toBe("/lead-leaks?reason=in_inbound_queue");
    expect(leadLeaksLink("dialer.first_dial_sla")).toBe("/lead-leaks");
    expect(leadLeaksLink("svc.slack")).toBeNull();
  });
});
